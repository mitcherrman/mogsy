import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIDEO_EXPORT_CONFIG,
  buildCommands,
  buildPrepareCommand,
  buildRenderCommand,
  buildTimestampsCommand,
  estimateTiming,
  quoteArg,
  type VideoExportConfig,
} from "./commands";
import { DEFAULT_INTRO_SECONDS, DEFAULT_OUTRO_SECONDS, DEFAULT_SEGMENTS } from "@/video/types";

const cfg = (overrides: Partial<VideoExportConfig> = {}): VideoExportConfig => ({
  ...DEFAULT_VIDEO_EXPORT_CONFIG,
  ...overrides,
});

describe("quoteArg", () => {
  it("passes simple tokens through unquoted", () => {
    expect(quoteArg("out/quiz.json")).toBe("out/quiz.json");
    expect(quoteArg("item_exact_stats")).toBe("item_exact_stats");
    expect(quoteArg("14.20")).toBe("14.20");
  });

  it("quotes values containing spaces", () => {
    expect(quoteArg("Mogsy League Quiz")).toBe('"Mogsy League Quiz"');
  });

  it("escapes embedded double quotes", () => {
    expect(quoteArg('say "hi"')).toBe('"say \\"hi\\""');
  });
});

describe("buildPrepareCommand", () => {
  it("emits favorites + limit + title + out with defaults", () => {
    const cmd = buildPrepareCommand(cfg({ numQuestions: 10 }));
    expect(cmd).toContain("npm run video:prepare --");
    expect(cmd).toContain("--favorites");
    expect(cmd).toContain("--limit 10");
    expect(cmd).toContain('--title "Mogsy League Quiz"');
    expect(cmd).toContain("--out out/quiz-video-input.json");
  });

  it("omits favorites and empty optional flags", () => {
    const cmd = buildPrepareCommand(
      cfg({ favoritesOnly: false, title: "", website: "", subtitle: "", patch: "" }),
    );
    expect(cmd).not.toContain("--favorites");
    expect(cmd).not.toContain("--title");
    expect(cmd).not.toContain("--website");
    expect(cmd).not.toContain("--subtitle");
    expect(cmd).not.toContain("--patch");
  });

  it("includes filter flags when set", () => {
    const cmd = buildPrepareCommand(
      cfg({ category: "item_exact_stats", pack: "pack_a", difficultyMin: "1", difficultyMax: "3", reviewStatus: "approved" }),
    );
    expect(cmd).toContain("--category item_exact_stats");
    expect(cmd).toContain("--pack pack_a");
    expect(cmd).toContain("--difficulty-min 1");
    expect(cmd).toContain("--difficulty-max 3");
    expect(cmd).toContain("--review-status approved");
  });

  it("clamps a zero/invalid question count to at least 1", () => {
    expect(buildPrepareCommand(cfg({ numQuestions: 0 }))).toContain("--limit 1");
  });
});

describe("render + timestamps commands", () => {
  it("render points --props at the prepared JSON and --out at the mp4", () => {
    const cmd = buildRenderCommand(cfg());
    expect(cmd).toContain("npm run video:render --");
    expect(cmd).toContain("--props out/quiz-video-input.json");
    expect(cmd).toContain("--out out/mogsy-quiz.mp4");
  });

  it("timestamps uses the timestamps script", () => {
    const cmd = buildTimestampsCommand(cfg());
    expect(cmd).toContain("npm run video:timestamps --");
    expect(cmd).toContain("--props out/quiz-video-input.json");
  });

  it("buildCommands returns all three", () => {
    const c = buildCommands(cfg());
    expect(c.prepare).toContain("video:prepare");
    expect(c.render).toContain("video:render");
    expect(c.timestamps).toContain("video:timestamps");
  });
});

describe("estimateTiming", () => {
  it("matches the shared timing model for N questions with explanations", () => {
    const n = 5;
    const est = estimateTiming(cfg({ numQuestions: n, assumeExplanations: true }));
    const perQ =
      DEFAULT_SEGMENTS.question +
      DEFAULT_SEGMENTS.countdown +
      DEFAULT_SEGMENTS.reveal +
      DEFAULT_SEGMENTS.explanation +
      DEFAULT_SEGMENTS.transition;
    expect(est.numQuestions).toBe(n);
    expect(est.introSeconds).toBe(DEFAULT_INTRO_SECONDS);
    expect(est.outroSeconds).toBe(DEFAULT_OUTRO_SECONDS);
    expect(est.perQuestionSeconds).toBe(perQ);
    expect(est.totalSeconds).toBe(DEFAULT_INTRO_SECONDS + n * perQ + DEFAULT_OUTRO_SECONDS);
  });

  it("drops the explanation segment when assumeExplanations is false", () => {
    const withExp = estimateTiming(cfg({ numQuestions: 3, assumeExplanations: true }));
    const noExp = estimateTiming(cfg({ numQuestions: 3, assumeExplanations: false }));
    expect(noExp.perQuestionSeconds).toBe(withExp.perQuestionSeconds - DEFAULT_SEGMENTS.explanation);
  });

  it("produces an Intro chapter, one per question, and an Outro chapter", () => {
    const est = estimateTiming(cfg({ numQuestions: 4 }));
    expect(est.chapters[0].label).toBe("Intro");
    expect(est.chapters[0].timestamp).toBe("00:00");
    expect(est.chapters.filter((c) => c.label.startsWith("Question")).length).toBe(4);
    expect(est.chapters[est.chapters.length - 1].label).toBe("Outro");
  });
});
