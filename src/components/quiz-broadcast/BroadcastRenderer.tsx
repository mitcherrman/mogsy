import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { EngineSnapshot } from "@/lib/quiz-broadcast/types";

type Props = {
  snapshot: EngineSnapshot | null;
  /** When true, fits to parent (preview). When false, fills viewport (window). */
  fitContainer?: boolean;
};

function getChoiceLabel(c: unknown): string {
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && "label" in c) return String((c as { label: string }).label);
  return String(c ?? "");
}

/**
 * BroadcastRenderer
 * --------------------------------------------------------------------------
 * Pure presentational component. Renders an EngineSnapshot. Reused by both
 * the Studio Preview and the Broadcast Window so there is exactly one
 * rendering implementation to maintain.
 */
export default function BroadcastRenderer({ snapshot, fitContainer = false }: Props) {
  // Live countdown ticker derived from snapshot — not stored in engine
  // (rendering concern only).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!snapshot?.playing) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [snapshot?.playing, snapshot?.phaseStartedAt]);

  if (!snapshot) {
    return (
      <ShellFrame fit={fitContainer} aspect="16:9">
        <div className="flex h-full w-full items-center justify-center text-white/60">
          Waiting for Broadcast Studio signal…
        </div>
      </ShellFrame>
    );
  }

  const v = snapshot.config.visuals;
  const t = snapshot.config.timing;
  const q = snapshot.currentQuestion;
  const phase = snapshot.phase;
  const elapsed = Math.max(0, now - snapshot.phaseStartedAt);
  const remaining = Math.max(0, snapshot.phaseDurationMs - elapsed);
  const phaseProgress = snapshot.phaseDurationMs > 0 ? Math.min(1, elapsed / snapshot.phaseDurationMs) : 0;

  const choices = (q?.choices ?? []).map(getChoiceLabel);
  const correct = snapshot.correctAnswer;

  const meta = (q?.metadata ?? {}) as Record<string, unknown>;
  const champion = (meta.champion as string | undefined) ?? "";
  const patch = (meta.patch as string | undefined) ?? "";

  const themeClass =
    v.theme === "midnight"
      ? "from-[#05060f] via-[#0a0b1f] to-[#15103a]"
      : v.theme === "classic"
      ? "from-[#0b0f1a] via-[#0e1626] to-[#0a1322]"
      : "from-[#06091a] via-[#0a1530] to-[#1a0f3a]"; // hextech default

  return (
    <ShellFrame fit={fitContainer} aspect={v.aspect}>
      <div className={`absolute inset-0 bg-gradient-to-br ${themeClass}`} />
      {v.backgroundAnimation === "pulse" && (
        <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_30%_20%,rgba(120,150,255,0.25),transparent_45%),radial-gradient(circle_at_75%_80%,rgba(255,120,200,0.18),transparent_50%)] animate-pulse" />
      )}
      {v.backgroundAnimation === "particles" && (
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:24px_24px]" />
      )}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-[2.2%] text-white/90">
        <div className="flex items-center gap-[1.2%]">
          {v.showLogo && (
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 backdrop-blur">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <span className="text-[1.2vmin] font-bold uppercase tracking-[0.2em]">Mogsy</span>
            </div>
          )}
          {v.showCategoryBadge && q && (
            <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[1.1vmin] uppercase tracking-widest text-white/80 backdrop-blur">
              {String(q.category).replace(/_/g, " ")}
            </span>
          )}
          {v.showDifficultyBadge && q?.difficulty != null && (
            <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-[1.1vmin] uppercase tracking-widest text-amber-200 backdrop-blur">
              Difficulty {q.difficulty}
            </span>
          )}
          {v.showPatchLabel && patch && (
            <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[1.1vmin] uppercase tracking-widest text-white/70 backdrop-blur">
              Patch {patch}
            </span>
          )}
        </div>
        <div className="flex items-center gap-[1.2%]">
          {v.showQuestionNumber && (
            <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[1.1vmin] font-semibold uppercase tracking-widest text-white/80 backdrop-blur">
              {Math.min(snapshot.currentIndex + 1, snapshot.playlistLength)} / {snapshot.playlistLength}
            </span>
          )}
          {v.showWebsite && (
            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-[1.1vmin] font-semibold uppercase tracking-[0.25em] text-cyan-100 backdrop-blur">
              {v.websiteUrl}
            </span>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="absolute inset-0 z-0 flex items-center justify-center px-[4%]">
        <AnimatePresence mode="wait">
          {phase === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center text-white/80">
              <div className="mb-4 text-[2.4vmin] uppercase tracking-[0.4em] text-cyan-200">Mogsy Quiz Broadcast</div>
              <div className="text-[6vmin] font-extrabold">Standing by…</div>
              <div className="mt-4 text-[1.6vmin] text-white/50">The host will be back shortly.</div>
            </motion.div>
          )}
          {phase !== "idle" && q && (
            <motion.div
              key={`q-${snapshot.currentIndex}-${phase}`}
              initial={transitionInitial(v.transitionStyle)}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={transitionExit(v.transitionStyle)}
              transition={{ duration: 0.4, ease: "easeOut" }}
              style={{ width: `${v.questionWidth}%`, fontSize: `${v.fontScale}em` }}
              className="flex flex-col items-center gap-[2.4%] text-white"
            >
              <div className="text-center text-[3.6vmin] font-extrabold leading-tight drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)] sm:text-[4vmin]">
                {q.question_text}
              </div>

              {/* Choices */}
              <div
                className={
                  v.answerStyle === "rows"
                    ? "flex w-full flex-col gap-[1.2%]"
                    : v.answerStyle === "grid"
                    ? "grid w-full grid-cols-2 gap-[1.4%]"
                    : "grid w-full grid-cols-2 gap-[1.4%]"
                }
              >
                {choices.map((label, i) => {
                  const isCorrect = phase !== "question" && correct && label === correct;
                  const isWrong = phase !== "question" && correct && label !== correct;
                  return (
                    <motion.div
                      key={`${label}-${i}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 * i, duration: 0.35 }}
                      className={[
                        "relative overflow-hidden rounded-2xl border px-[2%] py-[1.4%] text-[2.2vmin] font-semibold backdrop-blur",
                        isCorrect
                          ? "border-emerald-400/80 bg-emerald-400/20 text-emerald-50 shadow-[0_0_40px_rgba(16,185,129,0.45)]"
                          : isWrong
                          ? "border-white/10 bg-white/5 text-white/40"
                          : "border-white/15 bg-white/5 text-white",
                      ].join(" ")}
                    >
                      <span className="mr-[1%] inline-block text-[1.6vmin] font-black uppercase tracking-widest text-cyan-200">
                        {String.fromCharCode(65 + i)}
                      </span>
                      {label}
                    </motion.div>
                  );
                })}
              </div>

              {/* Explanation */}
              {phase === "explanation" && snapshot.explanation && v.showTips && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-[1%] w-full rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-[1.8%] text-[1.9vmin] leading-relaxed text-cyan-50 backdrop-blur"
                >
                  <div className="mb-2 text-[1.3vmin] font-bold uppercase tracking-widest text-cyan-200">
                    {champion ? `${champion} · Insight` : "Insight"}
                  </div>
                  {snapshot.explanation}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Countdown */}
      {phase === "question" && (
        <CountdownView
          style={v.countdownStyle}
          progress={phaseProgress}
          remainingMs={remaining}
          totalMs={t.questionMs}
        />
      )}

      {/* Bottom bar */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between p-[2.2%] text-white/80">
        <div className="text-[1.2vmin] uppercase tracking-[0.3em] text-white/50">
          {phaseLabel(phase)}
        </div>
        {v.showQrCode && (
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/30 p-[0.9%] backdrop-blur">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(`https://${v.websiteUrl}`)}`}
              alt="QR code"
              className="h-[7vmin] w-[7vmin] rounded-md"
            />
            <div className="pr-3 text-[1.1vmin] uppercase tracking-[0.25em] text-white/70">
              Play along
              <div className="text-[1.4vmin] font-bold text-white">{v.websiteUrl}</div>
            </div>
          </div>
        )}
      </div>
    </ShellFrame>
  );
}

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

function phaseLabel(p: string) {
  switch (p) {
    case "question":
      return "Question";
    case "reveal":
      return "Answer reveal";
    case "explanation":
      return "Insight";
    case "transition":
      return "Next up";
    default:
      return "Standing by";
  }
}

function transitionInitial(style: "fade" | "slide" | "zoom") {
  if (style === "slide") return { opacity: 0, x: 40 };
  if (style === "zoom") return { opacity: 0, scale: 0.92 };
  return { opacity: 0 };
}
function transitionExit(style: "fade" | "slide" | "zoom") {
  if (style === "slide") return { opacity: 0, x: -40 };
  if (style === "zoom") return { opacity: 0, scale: 1.06 };
  return { opacity: 0 };
}

function CountdownView({
  style,
  progress,
  remainingMs,
  totalMs,
}: {
  style: "bar" | "ring" | "digits";
  progress: number;
  remainingMs: number;
  totalMs: number;
}) {
  const secs = Math.ceil(remainingMs / 1000);
  if (style === "bar") {
    return (
      <div className="absolute inset-x-[10%] bottom-[14%] z-10">
        <div className="mb-1 flex items-center justify-between text-[1.1vmin] uppercase tracking-widest text-white/60">
          <span>Time</span>
          <span>{secs}s</span>
        </div>
        <div className="h-[1.2vmin] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-rose-400 transition-[width] duration-100"
            style={{ width: `${(1 - progress) * 100}%` }}
          />
        </div>
      </div>
    );
  }
  if (style === "digits") {
    return (
      <div className="absolute right-[4%] top-[12%] z-10 rounded-2xl border border-white/15 bg-black/40 px-[1.6%] py-[1%] text-[5vmin] font-black tabular-nums text-white backdrop-blur">
        {secs}
      </div>
    );
  }
  // ring
  const R = 40;
  const C = 2 * Math.PI * R;
  return (
    <div className="absolute right-[4%] top-[14%] z-10 h-[10vmin] w-[10vmin]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="url(#g)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * progress}
        />
        <defs>
          <linearGradient id="g">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#e879f9" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[2.6vmin] font-black tabular-nums text-white">
        {secs}
      </div>
    </div>
  );
}