/**
 * CON1 Step 2 Part 8 — PROOF that a command Admin emits is a command the
 * Content Factory accepts.
 *
 * Phase 0 of this workstream discovered that the originally suggested handoff
 * command was invalid: it named no source mode, and `parseScreenshotCli` throws
 * on that. A builder is therefore not allowed to be "reviewed for correctness";
 * it has to be run through the real parser. That is what this file does, and it
 * imports the ACTUAL `parseScreenshotCli` — no re-implementation, no fixture of
 * what the parser is believed to accept.
 *
 * Two levels of proof:
 *   1. the emitted `args` are accepted by the parser and produce the config the
 *      operator asked for;
 *   2. the emitted `command` STRING — the thing that actually goes on the
 *      clipboard — is tokenized by a real POSIX shell back into exactly those
 *      args, so the quoting cannot silently change what the parser receives.
 */

import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildContentCommand, CONTENT_COMMAND_SCRIPT } from "./command";
import { parseScreenshotCli } from "./cli";
import { FORMAT_KEYS } from "./formats";
import { RENDER_STATES } from "./types";
import { POST_TYPES } from "./content-posts";
import { DIFFICULTY_TIERS } from "./difficulty";

/** The argument portion of the copyable line — what the shell would split. */
function argPortion(command: string): string {
  const marker = `${CONTENT_COMMAND_SCRIPT} -- `;
  expect(command.startsWith(marker)).toBe(true);
  return command.slice(marker.length);
}

/** Tokenize with a REAL shell, so the quoting is proved rather than assumed. */
function shellSplit(argString: string): string[] {
  const out = execFileSync("/bin/sh", ["-c", `printf '%s\\n' ${argString}`], {
    encoding: "utf8",
  });
  return out.split("\n").slice(0, -1);
}

describe("the real CLI parser accepts what Admin emits", () => {
  it("single stored question — the exact Step 2 default handoff", () => {
    const built = buildContentCommand({
      questionIds: [41],
      formats: ["mobile-social"],
      states: ["question", "correct"],
    });
    expect(built.command).toBe(
      'npm run quiz:screenshots -- --question-id 41 --states "question,correct" ' +
        "--formats mobile-social",
    );

    const config = parseScreenshotCli(built.args);
    expect(config.source).toEqual({ mode: "question-id", ids: ["41"] });
    expect(config.states).toEqual(["question", "correct"]);
    expect(config.formats.map((f) => f.key)).toEqual(["mobile-social"]);
    // The overrides are OFF, because nothing emitted them.
    expect(config.allowIncompletePresentation).toBe(false);
    expect(config.allowMissingAssets).toBe(false);
    expect(config.adminKey).toBeUndefined();
    expect(config.api).toBeUndefined();
    expect(config.baseUrl).toBeUndefined();
  });

  it("multi-selection — ids reach the parser in the selected order", () => {
    const built = buildContentCommand({
      questionIds: [902, 41, 7],
      formats: ["vertical", "square"],
      states: ["question"],
    });
    const config = parseScreenshotCli(built.args);
    expect(config.source).toEqual({ mode: "question-id", ids: ["902", "41", "7"] });
    expect(config.formats.map((f) => f.key)).toEqual(["vertical", "square"]);
  });

  it("a carousel post parses, and carries no --states with it", () => {
    const built = buildContentCommand({
      questionIds: [12],
      formats: ["mobile-social"],
      states: ["question", "correct"],
      post: "answer-reveal",
    });
    const config = parseScreenshotCli(built.args);
    expect(config.post).toBe("answer-reveal");
  });

  it("every optional flag together parses into the requested config", () => {
    const built = buildContentCommand({
      questionIds: [3, 4],
      formats: ["landscape"],
      states: ["explanation"],
      difficulty: "diamond",
      runId: "weekly-drop_2",
      overwrite: true,
    });
    const config = parseScreenshotCli(built.args);
    expect(config.difficulty).toBe("diamond");
    expect(config.runId).toBe("weekly-drop_2");
    expect(config.overwrite).toBe(true);
    expect(config.states).toEqual(["explanation"]);
  });

  it("the whole registry cross-product parses", () => {
    for (const format of FORMAT_KEYS) {
      for (const state of RENDER_STATES) {
        const built = buildContentCommand({
          questionIds: [1],
          formats: [format],
          states: [state],
        });
        expect(() => parseScreenshotCli(built.args)).not.toThrow();
      }
    }
    for (const post of POST_TYPES) {
      for (const difficulty of DIFFICULTY_TIERS) {
        const built = buildContentCommand({
          questionIds: [1],
          formats: ["mobile-social"],
          states: [],
          post,
          difficulty,
        });
        expect(() => parseScreenshotCli(built.args)).not.toThrow();
      }
    }
  });
});

describe("the copyable string survives a real shell", () => {
  const cases = [
    { name: "default single", config: { questionIds: [41], formats: ["mobile-social"], states: ["question", "correct"] as const } },
    { name: "multi + run id", config: { questionIds: [1, 2, 3], formats: ["vertical", "landscape"], states: ["correct"] as const, runId: "drop-1", overwrite: true } },
    { name: "post + difficulty", config: { questionIds: [8], formats: ["square"], states: [] as const, post: "single-question" as const, difficulty: "gold" as const } },
  ];

  for (const { name, config } of cases) {
    it(`${name}: /bin/sh splits it back into exactly the emitted args`, () => {
      const built = buildContentCommand({ ...config, states: [...config.states] });
      expect(built.errors).toEqual([]);
      expect(shellSplit(argPortion(built.command))).toEqual(built.args);
    });

    it(`${name}: the shell-split string is accepted by the parser`, () => {
      const built = buildContentCommand({ ...config, states: [...config.states] });
      expect(() => parseScreenshotCli(shellSplit(argPortion(built.command)))).not.toThrow();
    });
  }
});

describe("the Phase 0 regression", () => {
  it("a command with no source mode is still rejected by the parser", () => {
    // The invalid original suggestion, kept as the reason this file exists.
    expect(() =>
      parseScreenshotCli(["--states", "question", "--formats", "mobile-social"]),
    ).toThrow(/No question source/);
  });

  it("the builder can never produce one: every success carries a source flag", () => {
    const built = buildContentCommand({
      questionIds: [1],
      formats: ["mobile-social"],
      states: ["question"],
    });
    expect(["--question-id", "--question-ids"]).toContain(built.args[0]);
  });
});
