import { describe, expect, it } from "vitest";
import { FPS, buildChapters, buildMetadata, buildTimeline, formatTimestamp } from "./timing";
import { SAMPLE_QUIZ_VIDEO } from "./sample-data";
import { resolveCorrectIndex, type QuizVideoData } from "./types";

const TINY: QuizVideoData = {
  title: "T",
  intro_seconds: 2,
  outro_seconds: 3,
  default_durations: { question: 1, countdown: 2, reveal: 1, explanation: 2, transition: 1 },
  questions: [
    { id: 1, question: "Q1?", choices: ["a", "b"], correct_index: 1, explanation: "because" },
    { id: 2, question: "Q2?", choices: ["a", "b"], correct_answer: "a" }, // no explanation
  ],
};

describe("buildTimeline", () => {
  it("lays out contiguous, deterministic segments", () => {
    const t = buildTimeline(TINY);
    expect(t.fps).toBe(FPS);
    expect(t.introFrames).toBe(2 * FPS);
    const [q1, q2] = t.questions;
    expect(q1.startFrame).toBe(2 * FPS);
    expect(q1.choicesFrame).toBe(q1.startFrame + 1 * FPS);
    expect(q1.revealFrame).toBe(q1.choicesFrame + 2 * FPS);
    expect(q1.explanationFrame).toBe(q1.revealFrame + 1 * FPS);
    expect(q1.outFrame).toBe(q1.explanationFrame + 2 * FPS); // has explanation
    expect(q1.endFrame).toBe(q1.outFrame + 1 * FPS);
    expect(q2.startFrame).toBe(q1.endFrame); // contiguous
    expect(q2.hasExplanation).toBe(false);
    expect(q2.outFrame).toBe(q2.explanationFrame); // explanation skipped
    expect(t.outroStartFrame).toBe(q2.endFrame);
    expect(t.totalFrames).toBe(t.outroStartFrame + 3 * FPS);
  });

  it("respects per-question duration overrides", () => {
    const t = buildTimeline({
      ...TINY,
      questions: [{ ...TINY.questions[0], durations: { countdown: 5 } }],
    });
    const q = t.questions[0];
    expect(q.revealFrame - q.choicesFrame).toBe(5 * FPS);
  });
});

describe("formatTimestamp", () => {
  it("formats MM:SS and H:MM:SS", () => {
    expect(formatTimestamp(0)).toBe("00:00");
    expect(formatTimestamp(65)).toBe("01:05");
    expect(formatTimestamp(3671)).toBe("1:01:11");
  });
});

describe("buildChapters", () => {
  it("emits intro, one chapter per question, and outro", () => {
    const chapters = buildChapters(TINY);
    expect(chapters).toHaveLength(4);
    expect(chapters[0]).toEqual({ seconds: 0, timestamp: "00:00", label: "Intro" });
    expect(chapters[1].label).toBe("Question 1 — Q1?");
    expect(chapters[1].timestamp).toBe("00:02");
    expect(chapters[3].label).toBe("Outro");
  });

  it("matches the sample data timeline", () => {
    const meta = buildMetadata(SAMPLE_QUIZ_VIDEO);
    expect(meta.questions).toHaveLength(5);
    expect(meta.chapters[0].timestamp).toBe("00:00");
    // reveal always after start
    for (const q of meta.questions) {
      expect(q.reveal_seconds).toBeGreaterThan(q.start_seconds);
    }
  });
});

describe("resolveCorrectIndex", () => {
  it("prefers correct_index, falls back to correct_answer, else -1", () => {
    expect(resolveCorrectIndex({ id: 1, question: "", choices: ["a", "b"], correct_index: 1 })).toBe(1);
    expect(resolveCorrectIndex({ id: 1, question: "", choices: ["a", "B "], correct_answer: "b" })).toBe(1);
    expect(resolveCorrectIndex({ id: 1, question: "", choices: ["a", "b"] })).toBe(-1);
    expect(resolveCorrectIndex({ id: 1, question: "", choices: ["a"], correct_index: 5 })).toBe(-1);
  });
});
