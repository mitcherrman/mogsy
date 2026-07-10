import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BottomTimeline, GoldTrim, StageBackdrop } from "@/components/quiz-broadcast/BroadcastRenderer";
import { FONT_STACK } from "./format";
import { buildTimeline } from "./timing";
import type { QuizVideoData } from "./types";
import { BroadcastQuestionScene } from "./BroadcastQuestionScene";
import { VideoKnowledgeCore } from "./broadcast-fx/VideoKnowledgeCore";
import type { VideoPhaseState } from "./broadcast-fx/videoPhase";

/** Idle broadcast-phase state for the intro/outro core (gentle heartbeat,
 *  no countdown pressure). Time comes from the card's local frame clock. */
function idleCoreState(localMs: number): VideoPhaseState {
  return {
    phase: "question",
    phaseElapsedMs: localMs,
    phaseDurationMs: 0,
    remainingToRevealMs: Infinity,
    sinceRevealMs: -Infinity,
    localMs,
  };
}
const zero = () => 0;

/** The Knowledge Core standing idle behind the intro/outro title cards —
 *  fills the broadcast's title beats with its identity object instead of
 *  dead air. Deterministic: driven by the card's local frame time. */
const IdleCoreBackdrop: React.FC<{ opacity: number }> = ({ opacity }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localMs = (frame / fps) * 1000;
  return (
    <AbsoluteFill className="items-center justify-center" style={{ opacity }}>
      <div className="h-[62%] w-[35%]">
        <VideoKnowledgeCore
          state={idleCoreState(localMs)}
          questionIndex={1}
          revealAtMs={Infinity}
          pulseAt={zero}
          overloadAt={zero}
          compact
        />
      </div>
    </AbsoluteFill>
  );
};

/**
 * Top-level composition: intro card → question scenes → outro card, laid out
 * on the shared deterministic timeline (./timing.ts).
 *
 * The stage itself (backdrop, gold trim, progress bar) and the question
 * scenes are the REAL quiz-broadcast components — the live broadcast is the
 * visual source of truth; Remotion is only the frame-based export controller.
 *
 * No API fetch happens inside the render: the champion asset manifest is
 * embedded in the input JSON by scripts/prepare-quiz-video.ts and seeded
 * into a react-query cache here, so useChampionAssets resolves instantly.
 */
export const QuizVideo: React.FC<{ data: QuizVideoData }> = ({ data }) => {
  const timeline = buildTimeline(data);

  // Publish the asset base BEFORE children render so resolveQuizAssetUrl /
  // resolveAssetUrl turn relative metadata paths into real URLs. The Remotion
  // bundle has no import.meta.env, so without this every relative icon/splash
  // would resolve against the localhost fallback and 404 into placeholders.
  if (data.asset_base_url) {
    (globalThis as { __MOGSY_ASSET_BASE__?: string }).__MOGSY_ASSET_BASE__ = data.asset_base_url;
  }

  // Seed the champion manifest so broadcast components never fetch.
  // staleTime: Infinity keeps the seeded value (manifest or null) fresh for
  // the whole render; queries therefore never hit their queryFn.
  const queryClient = useMemo(() => {
    const qc = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } },
    });
    qc.setQueryData(["champion-assets"], data.champion_manifest ?? null);
    return qc;
  }, [data.champion_manifest]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* containerType: broadcast components size themselves in cqmin, so the
          1920x1080 frame must be a CSS size-container (like ShellFrame). */}
      <AbsoluteFill style={{ fontFamily: FONT_STACK, containerType: "size" }} className="bg-black text-white">
        <StageBackdrop theme="hextech" animation="particles" />
        <GoldTrim />

        {timeline.introFrames > 0 && (
          <Sequence durationInFrames={timeline.introFrames} name="Intro">
            <TitleCard title={data.title} subtitle={data.subtitle} website={data.website} patch={data.patch} />
          </Sequence>
        )}

        {timeline.questions.map((qt) => (
          <Sequence
            key={String(qt.question.id)}
            from={qt.startFrame}
            durationInFrames={qt.endFrame - qt.startFrame}
            name={`Q${qt.index + 1}`}
          >
            <BroadcastQuestionScene timeline={qt} total={timeline.questions.length} patch={data.patch} />
          </Sequence>
        ))}

        {timeline.outroFrames > 0 && (
          <Sequence from={timeline.outroStartFrame} durationInFrames={timeline.outroFrames} name="Outro">
            <OutroCard website={data.website} />
          </Sequence>
        )}

        {/* Broadcast bottom progress bar — advances per question */}
        <ProgressBar timelineTotal={timeline.questions.length} />

        {/* Website CTA — video-only, small stage corner so it never displaces
            the broadcast layout (the Knowledge Core keeps its panel). */}
        {data.website && (
          <div className="pointer-events-none absolute bottom-[1.6%] right-[2%] z-[12] text-[1.15cqmin] font-bold uppercase tracking-[0.28em] text-[#f3dca0]/60">
            {data.website}
          </div>
        )}
      </AbsoluteFill>
    </QueryClientProvider>
  );
};

/** Frame-driven wrapper for the shared BottomTimeline progress bar. The
 *  scenes already show Q n/m, so the bar simply fills across the video. */
const ProgressBar: React.FC<{ timelineTotal: number }> = ({ timelineTotal }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const current = Math.min(
    timelineTotal,
    Math.max(0, Math.round((frame / Math.max(1, durationInFrames)) * timelineTotal)),
  );
  return <BottomTimeline current={current} total={timelineTotal} />;
};

/* ── Intro / outro title cards — broadcast IdleStanding styling ─────────── */

const TitleCard: React.FC<{ title: string; subtitle?: string; website?: string; patch?: string }> = ({
  title,
  subtitle,
  patch,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 35 });
  const exit = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <IdleCoreBackdrop opacity={0.28 * enter * exit} />
      <AbsoluteFill
        className="items-center justify-center text-center"
        style={{ opacity: enter * exit, transform: `scale(${0.92 + enter * 0.08})` }}
      >
      <div className="mb-3 text-[1.5cqmin] uppercase tracking-[0.45em] text-[#e8c97a]">Mogsy Quiz Broadcast</div>
      <div className="bg-gradient-to-b from-white to-[#f3dca0] bg-clip-text text-[7cqmin] font-black uppercase text-transparent">
        {title}
      </div>
      {subtitle && (
        <div className="mt-3 text-[2.2cqmin] text-white/70">{subtitle}</div>
      )}
      {patch && (
        <div className="mt-4 text-[1.4cqmin] uppercase tracking-[0.3em] text-cyan-300/90">Patch {patch}</div>
      )}
      </AbsoluteFill>
    </>
  );
};

const OutroCard: React.FC<{ website?: string }> = ({ website }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  return (
    <>
      <IdleCoreBackdrop opacity={0.28 * enter} />
      <AbsoluteFill className="items-center justify-center text-center" style={{ opacity: enter }}>
        <div className="bg-gradient-to-b from-white to-[#f3dca0] bg-clip-text text-[5.5cqmin] font-black uppercase text-transparent">
          How many did you get?
        </div>
        <div className="mt-4 text-[2.2cqmin] text-white/70">Drop your score in the comments</div>
        {website && (
          <div className="mt-6 text-[2cqmin] font-extrabold tracking-wider text-[#f3dca0]">
            Play daily at {website}
          </div>
        )}
      </AbsoluteFill>
    </>
  );
};
