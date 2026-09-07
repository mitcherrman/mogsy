import { describe, expect, it } from "vitest";
import {
  CLI_USAGE,
  DEFAULT_BATCH_LIMIT,
  MAX_BATCH_LIMIT,
  parseScreenshotCli,
} from "./cli";
import { RENDER_STATES } from "./types";

describe("parseScreenshotCli", () => {
  it("parses a single question id with content-first defaults", () => {
    const c = parseScreenshotCli(["--question-id", "123"]);
    expect(c.source).toEqual({ mode: "question-id", ids: ["123"] });
    // Content-first defaults: unanswered hook + reveal, mobile-social format.
    expect(c.states).toEqual(["question", "correct"]);
    expect(c.formats.map((f) => f.key)).toEqual(["mobile-social"]);
    expect(c.formats[0].kind).toBe("social");
    expect(c.overwrite).toBe(false);
  });

  it("keeps every state and audit format reachable explicitly", () => {
    const c = parseScreenshotCli([
      "--question-id", "1",
      "--states", RENDER_STATES.join(","),
      "--formats", "mobile-audit,desktop-audit",
    ]);
    expect(c.states).toEqual([...RENDER_STATES]);
    expect(c.formats.every((f) => f.kind === "audit")).toBe(true);
  });

  it("parses multiple ids and rejects duplicates", () => {
    const c = parseScreenshotCli(["--question-ids", "1,2,3"]);
    expect(c.source).toEqual({ mode: "question-id", ids: ["1", "2", "3"] });
    expect(() => parseScreenshotCli(["--question-ids", "1,1"])).toThrow(/duplicates/);
  });

  it("requires exactly one source", () => {
    expect(() => parseScreenshotCli([])).toThrow(/No question source/);
    expect(() => parseScreenshotCli(["--question-id", "1", "--approved"])).toThrow(/Conflicting/);
    expect(() => parseScreenshotCli(["--pack", "p", "--fixture", "f.json"])).toThrow(/Conflicting/);
  });

  it("enforces the default and maximum batch limits", () => {
    const c = parseScreenshotCli(["--approved"]);
    expect(c.source).toEqual({ mode: "approved", limit: DEFAULT_BATCH_LIMIT });
    const c2 = parseScreenshotCli(["--approved", "--limit", "20"]);
    expect(c2.source).toEqual({ mode: "approved", limit: 20 });
    expect(() => parseScreenshotCli(["--approved", "--limit", "0"])).toThrow(/positive/);
    expect(() => parseScreenshotCli(["--approved", "--limit", "-3"])).toThrow(/positive/);
    expect(() => parseScreenshotCli(["--approved", "--limit", "abc"])).toThrow(/positive/);
    expect(() =>
      parseScreenshotCli(["--approved", "--limit", String(MAX_BATCH_LIMIT + 1)]),
    ).toThrow(/maximum/);
  });

  it("rejects unknown flags and unknown states/formats", () => {
    expect(() => parseScreenshotCli(["--question-id", "1", "--frobnicate"])).toThrow(/Unknown argument/);
    expect(() => parseScreenshotCli(["--question-id", "1", "--states", "nope"])).toThrow(/Unknown state/);
    expect(() => parseScreenshotCli(["--question-id", "1", "--formats", "gigantic"])).toThrow(/Unknown format/);
  });

  it("parses states and formats selections", () => {
    const c = parseScreenshotCli([
      "--question-id", "1",
      "--states", "question,correct",
      "--formats", "vertical,mobile-audit",
    ]);
    expect(c.states).toEqual(["question", "correct"]);
    expect(c.formats.map((f) => f.key)).toEqual(["vertical", "mobile-audit"]);
  });

  it("rejects unsafe output roots", () => {
    expect(() => parseScreenshotCli(["--question-id", "1", "--out", "../evil"])).toThrow(/traversal/);
    expect(() => parseScreenshotCli(["--question-id", "1", "--out", "public/x"])).toThrow(/public/);
  });

  it("defaults to local capture: rejects non-localhost base-url without --allow-remote", () => {
    expect(() =>
      parseScreenshotCli(["--question-id", "1", "--base-url", "https://mogzy.lol"]),
    ).toThrow(/not local/);
    const ok = parseScreenshotCli(["--question-id", "1", "--base-url", "http://localhost:8080"]);
    expect(ok.baseUrl).toBe("http://localhost:8080");
    const remote = parseScreenshotCli([
      "--question-id", "1",
      "--base-url", "https://staging.example.com",
      "--allow-remote",
    ]);
    expect(remote.allowRemote).toBe(true);
  });

  it("finalize-run: report-only mode with safe id and restricted flags", () => {
    const c = parseScreenshotCli(["--finalize-run", "item-build-review-100"]);
    expect(c.finalizeRun).toBe("item-build-review-100");
    expect(c.overwrite).toBe(false);
    const c2 = parseScreenshotCli(["--finalize-run", "run-1", "--overwrite", "--out", "quiz_content_exports"]);
    expect(c2.overwrite).toBe(true);
  });

  it("finalize-run: rejects traversal ids and capture-source/server flags", () => {
    expect(() => parseScreenshotCli(["--finalize-run", "../evil"])).toThrow(/Invalid --finalize-run/);
    expect(() => parseScreenshotCli(["--finalize-run", "runs/other"])).toThrow(/Invalid --finalize-run/);
    expect(() => parseScreenshotCli(["--finalize-run", "r1", "--question-id", "1"])).toThrow(/only accepts/);
    expect(() => parseScreenshotCli(["--finalize-run", "r1", "--approved"])).toThrow(/only accepts/);
    expect(() => parseScreenshotCli(["--finalize-run", "r1", "--base-url", "http://localhost:1"])).toThrow(/only accepts/);
    expect(() => parseScreenshotCli(["--finalize-run", "r1", "--admin-key", "x"])).toThrow(/only accepts/);
  });

  it("validates answer-index and run-id via downstream rules", () => {
    expect(() => parseScreenshotCli(["--question-id", "1", "--answer-index", "-1"])).toThrow();
    const c = parseScreenshotCli(["--question-id", "1", "--answer-index", "2", "--run-id", "smoke-1"]);
    expect(c.answerIndex).toBe(2);
    expect(c.runId).toBe("smoke-1");
  });

  it("parses --post carousel types and rejects unknown ones", () => {
    expect(parseScreenshotCli(["--question-id", "1", "--post", "single-question"]).post).toBe(
      "single-question",
    );
    expect(parseScreenshotCli(["--question-id", "1", "--post", "answer-reveal"]).post).toBe(
      "answer-reveal",
    );
    expect(() => parseScreenshotCli(["--question-id", "1", "--post", "carousel"])).toThrow(/Unknown --post/);
  });

  it("--post is mutually exclusive with --states", () => {
    expect(() =>
      parseScreenshotCli(["--question-id", "1", "--post", "single-question", "--states", "question"]),
    ).toThrow(/do not combine it with --states/);
  });

  it("parses --difficulty tiers (case-insensitive) and rejects unknown tiers", () => {
    expect(parseScreenshotCli(["--question-id", "1", "--difficulty", "GOLD"]).difficulty).toBe("gold");
    expect(parseScreenshotCli(["--question-id", "1", "--difficulty", "diamond"]).difficulty).toBe(
      "diamond",
    );
    expect(() => parseScreenshotCli(["--question-id", "1", "--difficulty", "silver"])).toThrow(
      /Unknown --difficulty/,
    );
  });

  it("post + difficulty compose on a normal source", () => {
    const c = parseScreenshotCli(["--question-id", "1", "--post", "answer-reveal", "--difficulty", "iron"]);
    expect(c.post).toBe("answer-reveal");
    expect(c.difficulty).toBe("iron");
  });
});

describe("--allow-incomplete-presentation (CON1 Step 1D)", () => {
  it("defaults to false — fail-closed is the default publishing posture", () => {
    expect(
      parseScreenshotCli(["--question-id", "1"]).allowIncompletePresentation,
    ).toBe(false);
    expect(parseScreenshotCli(["--approved"]).allowIncompletePresentation).toBe(false);
  });

  it("is a boolean flag that takes no value", () => {
    const c = parseScreenshotCli([
      "--question-id",
      "1",
      "--allow-incomplete-presentation",
      "--states",
      "question",
    ]);
    expect(c.allowIncompletePresentation).toBe(true);
    expect(c.states).toEqual(["question"]);
  });

  it("composes with the other options rather than replacing a source", () => {
    const c = parseScreenshotCli([
      "--approved",
      "--limit",
      "3",
      "--allow-incomplete-presentation",
    ]);
    expect(c.source).toEqual({ mode: "approved", limit: 3 });
    expect(c.allowIncompletePresentation).toBe(true);
  });

  it("is refused in report-only recovery mode, which captures nothing", () => {
    expect(() =>
      parseScreenshotCli(["--finalize-run", "run-1", "--allow-incomplete-presentation"]),
    ).toThrow(/--finalize-run only accepts/);
    expect(
      parseScreenshotCli(["--finalize-run", "run-1"]).allowIncompletePresentation,
    ).toBe(false);
  });

  it("is documented in the CLI usage text", () => {
    expect(CLI_USAGE).toContain("--allow-incomplete-presentation");
    expect(CLI_USAGE).toMatch(/DIAGNOSTIC/);
  });
});

describe("--allow-missing-assets (CON1 Step 1E)", () => {
  it("defaults to false — fail-closed is the default publishing posture", () => {
    expect(parseScreenshotCli(["--question-id", "1"]).allowMissingAssets).toBe(false);
    expect(parseScreenshotCli(["--approved"]).allowMissingAssets).toBe(false);
  });

  it("is a boolean flag that takes no value", () => {
    const c = parseScreenshotCli([
      "--question-id",
      "1",
      "--allow-missing-assets",
      "--states",
      "question",
    ]);
    expect(c.allowMissingAssets).toBe(true);
    expect(c.states).toEqual(["question"]);
  });

  it("is INDEPENDENT of the presentation override in both directions", () => {
    // The whole reason it is a second flag: a premise the layout did not draw
    // and a file that is not on disk are different failure classes, and one
    // must never silence the other.
    const assets = parseScreenshotCli(["--approved", "--allow-missing-assets"]);
    expect(assets.allowMissingAssets).toBe(true);
    expect(assets.allowIncompletePresentation).toBe(false);

    const presentation = parseScreenshotCli([
      "--approved",
      "--allow-incomplete-presentation",
    ]);
    expect(presentation.allowIncompletePresentation).toBe(true);
    expect(presentation.allowMissingAssets).toBe(false);

    const both = parseScreenshotCli([
      "--approved",
      "--allow-incomplete-presentation",
      "--allow-missing-assets",
    ]);
    expect(both.allowIncompletePresentation).toBe(true);
    expect(both.allowMissingAssets).toBe(true);
  });

  it("is refused in report-only recovery mode, which captures nothing", () => {
    expect(() =>
      parseScreenshotCli(["--finalize-run", "run-1", "--allow-missing-assets"]),
    ).toThrow(/--finalize-run only accepts/);
    expect(parseScreenshotCli(["--finalize-run", "run-1"]).allowMissingAssets).toBe(false);
  });

  it("is documented in the CLI usage text", () => {
    expect(CLI_USAGE).toContain("--allow-missing-assets");
  });
});
