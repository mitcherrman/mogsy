import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT_STACK } from "./format";
import { buildTimeline } from "./timing";
import type { QuizVideoData } from "./types";
import { QuizQuestionScene } from "./QuizQuestionScene";

/**
 * Top-level composition: intro card → question scenes → outro card,
 * laid out on the shared deterministic timeline (see ./timing.ts).
 */
export const QuizVideo: React.FC<{ data: QuizVideoData }> = ({ data }) => {
  const timeline = buildTimeline(data);
  return (
    <AbsoluteFill style={{ background: COLORS.bg0, fontFamily: FONT_STACK }}>
      <Backdrop />
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
          <QuizQuestionScene timeline={qt} total={timeline.questions.length} />
        </Sequence>
      ))}
      {timeline.outroFrames > 0 && (
        <Sequence from={timeline.outroStartFrame} durationInFrames={timeline.outroFrames} name="Outro">
          <OutroCard website={data.website} />
        </Sequence>
      )}
      <Footer website={data.website} />
    </AbsoluteFill>
  );
};

/* ── Static backdrop: radial hextech glow + vignette (deterministic) ───── */

const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Slow deterministic pulse driven purely by frame number
  const pulse = 0.5 + 0.5 * Math.sin((frame / fps) * Math.PI * 0.25);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 700px at 50% 40%, ${COLORS.bg1} 0%, ${COLORS.bg0} 70%)`,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 500px at 50% 45%, rgba(10,200,185,${0.05 + pulse * 0.04}) 0%, transparent 65%)`,
        }}
      />
      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 220px rgba(0,0,0,0.85)",
        }}
      />
      {/* Gold trim */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, transparent, ${COLORS.gold}, transparent)` }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, transparent, ${COLORS.gold}, transparent)` }} />
    </AbsoluteFill>
  );
};

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
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        color: COLORS.text,
        opacity: enter * exit,
        transform: `scale(${0.92 + enter * 0.08})`,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 110, fontWeight: 900, letterSpacing: 3, color: COLORS.goldBright, textShadow: `0 0 60px rgba(200,170,110,0.5)` }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 44, marginTop: 28, color: COLORS.textDim }}>{subtitle}</div>
      )}
      {patch && (
        <div style={{ fontSize: 30, marginTop: 40, color: COLORS.cyan, letterSpacing: 2 }}>
          PATCH {patch}
        </div>
      )}
    </AbsoluteFill>
  );
};

const OutroCard: React.FC<{ website?: string }> = ({ website }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", textAlign: "center", opacity: enter }}
    >
      <div style={{ fontSize: 80, fontWeight: 900, color: COLORS.goldBright }}>
        How many did you get?
      </div>
      <div style={{ fontSize: 42, marginTop: 30, color: COLORS.textDim }}>
        Drop your score in the comments
      </div>
      {website && (
        <div style={{ fontSize: 38, marginTop: 46, color: COLORS.cyan, fontWeight: 700 }}>
          Play daily at {website}
        </div>
      )}
    </AbsoluteFill>
  );
};

const Footer: React.FC<{ website?: string }> = ({ website }) => {
  if (!website) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        right: 48,
        fontSize: 26,
        color: "rgba(240,230,210,0.45)",
        letterSpacing: 1,
        fontFamily: FONT_STACK,
      }}
    >
      {website}
    </div>
  );
};
