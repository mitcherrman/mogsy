/**
 * CON1 Step 2 — the Admin → Content Factory command builder.
 *
 * Two things are being held here. The obvious one is determinism and quoting.
 * The important one is what the builder REFUSES to emit: an admin key, a
 * backend URL, and the two Step 1D/1E diagnostic overrides. A readiness
 * preflight that then hands over a command waiving the very gates it checked
 * would be worse than no preflight at all.
 *
 * The parser-acceptance proof lives in `command.parser.test.ts`.
 */

import { describe, expect, it } from "vitest";
import {
  buildContentCommand,
  CONTENT_COMMAND_SCRIPT,
  DEFAULT_CONTENT_COMMAND_CONFIG,
  NEVER_EMITTED_FLAGS,
  type ContentCommandConfig,
} from "./command";
import { MAX_BATCH_LIMIT } from "./cli";
import { FORMAT_KEYS } from "./formats";
import { RENDER_STATES } from "./types";
import { POST_TYPES } from "./content-posts";
import { DIFFICULTY_TIERS } from "./difficulty";

const base = (over: Partial<ContentCommandConfig> = {}): ContentCommandConfig => ({
  ...DEFAULT_CONTENT_COMMAND_CONFIG,
  questionIds: [41],
  ...over,
});

describe("exact CLI syntax", () => {
  it("emits --question-id for a single stored question", () => {
    const built = buildContentCommand(base());
    expect(built.errors).toEqual([]);
    expect(built.args).toEqual([
      "--question-id", "41",
      "--states", "question,correct",
      "--formats", "mobile-social",
    ]);
    // The shared quoter (`@/lib/cli/shellQuote`) is conservative: a comma is
    // outside its bare-token allow-list, so a CSV value is double-quoted. That
    // is harmless and PROVED harmless — `command.parser.test.ts` splits this
    // exact string with /bin/sh and gets `args` back.
    expect(built.command).toBe(
      `${CONTENT_COMMAND_SCRIPT} -- --question-id 41 --states "question,correct" --formats mobile-social`,
    );
  });

  it("emits --question-ids as a comma list for a multi-selection", () => {
    const built = buildContentCommand(base({ questionIds: [41, 7, 902] }));
    expect(built.args.slice(0, 2)).toEqual(["--question-ids", "41,7,902"]);
  });

  it("emits every optional flag in a fixed order", () => {
    const built = buildContentCommand(
      base({
        questionIds: [1, 2],
        formats: ["vertical", "square"],
        states: ["question", "explanation"],
        difficulty: "diamond",
        runId: "weekly-drop",
        overwrite: true,
      }),
    );
    expect(built.args).toEqual([
      "--question-ids", "1,2",
      "--states", "question,explanation",
      "--formats", "vertical,square",
      "--difficulty", "diamond",
      "--run-id", "weekly-drop",
      "--overwrite",
    ]);
  });

  it("replaces --states with --post, never combines them (the CLI rejects that)", () => {
    const built = buildContentCommand(
      base({ post: "answer-reveal", states: ["question", "correct"] }),
    );
    expect(built.args).toContain("--post");
    expect(built.args).not.toContain("--states");
    expect(built.args).toEqual([
      "--question-id", "41", "--post", "answer-reveal", "--formats", "mobile-social",
    ]);
  });
});

describe("registry vocabulary — no Admin-only copies", () => {
  it("accepts every format key the registry declares", () => {
    for (const key of FORMAT_KEYS) {
      expect(buildContentCommand(base({ formats: [key] })).errors).toEqual([]);
    }
  });

  it("accepts every render state the registry declares", () => {
    for (const state of RENDER_STATES) {
      expect(buildContentCommand(base({ states: [state] })).errors).toEqual([]);
    }
  });

  it("accepts every post type and difficulty tier the registries declare", () => {
    for (const post of POST_TYPES) {
      expect(buildContentCommand(base({ post })).errors).toEqual([]);
    }
    for (const difficulty of DIFFICULTY_TIERS) {
      expect(buildContentCommand(base({ difficulty })).errors).toEqual([]);
    }
  });

  it("rejects a value that is not in the registry", () => {
    expect(buildContentCommand(base({ formats: ["tiktok"] })).errors[0]).toContain(
      'Unknown format "tiktok"',
    );
    expect(
      buildContentCommand(base({ states: ["revealed" as never] })).errors[0],
    ).toContain('Unknown state "revealed"');
  });
});

describe("determinism", () => {
  it("produces byte-identical output for the same config", () => {
    const config = base({
      questionIds: [9, 4, 4, 12],
      formats: ["mobile-social", "landscape"],
      states: ["correct", "question"],
      difficulty: "gold",
    });
    const a = buildContentCommand(config);
    const b = buildContentCommand({ ...config });
    expect(a.command).toBe(b.command);
    expect(a.args).toEqual(b.args);
  });

  it("preserves the selection order rather than sorting it", () => {
    // A carousel post is an ordered sequence; re-sorting would change the
    // artefact the operator asked for.
    expect(buildContentCommand(base({ questionIds: [30, 4, 17] })).args[1]).toBe("30,4,17");
    expect(buildContentCommand(base({ questionIds: [17, 4, 30] })).args[1]).toBe("17,4,30");
  });

  it("collapses a repeated id (a selection is a set) without erroring", () => {
    const built = buildContentCommand(base({ questionIds: [5, 5, 6] }));
    expect(built.errors).toEqual([]);
    expect(built.args[1]).toBe("5,6");
  });
});

describe("quoting", () => {
  it("leaves plain tokens unquoted and quotes only the CSV values", () => {
    const built = buildContentCommand(
      base({ runId: "drop_2026-09-06", formats: ["mobile-social"], states: ["question"] }),
    );
    expect(built.command).toBe(
      `${CONTENT_COMMAND_SCRIPT} -- --question-id 41 --states question ` +
        `--formats mobile-social --run-id drop_2026-09-06`,
    );
    expect(built.command).not.toContain('"');
  });

  it("refuses a run name that would need shell quoting at all", () => {
    // The safest quoting is a value that never needs it: run ids name a
    // directory, so the builder holds them to the runner's own id shape rather
    // than escaping something exotic into a path.
    for (const bad of ["my run", "../escape", "drop;rm -rf /", "$(whoami)"]) {
      const built = buildContentCommand(base({ runId: bad }));
      expect(built.errors[0]).toContain("Invalid run name");
      expect(built.command).toBe("");
      expect(built.args).toEqual([]);
    }
  });

  it("refuses an id containing the list separator", () => {
    const built = buildContentCommand(base({ questionIds: ["41,42"] }));
    expect(built.errors[0]).toContain("contains a comma");
    expect(built.command).toBe("");
  });
});

describe("secrets and diagnostic overrides", () => {
  const everything = base({
    questionIds: [1, 2, 3],
    formats: [...FORMAT_KEYS],
    states: [...RENDER_STATES],
    difficulty: "iron",
    runId: "full",
    overwrite: true,
  });

  it("never emits an admin key, an API url, or a base url", () => {
    const built = buildContentCommand(everything);
    for (const flag of NEVER_EMITTED_FLAGS) {
      expect(built.args).not.toContain(flag);
      expect(built.command).not.toContain(flag);
    }
  });

  it("never emits the completeness overrides — they are off by construction", () => {
    const built = buildContentCommand(everything);
    expect(built.command).not.toContain("--allow-incomplete-presentation");
    expect(built.command).not.toContain("--allow-missing-assets");
    // And there is no config field that could turn them on.
    expect(Object.keys(DEFAULT_CONTENT_COMMAND_CONFIG)).not.toContain(
      "allowIncompletePresentation",
    );
    expect(Object.keys(DEFAULT_CONTENT_COMMAND_CONFIG)).not.toContain("allowMissingAssets");
  });

  it("names both overrides in NEVER_EMITTED_FLAGS so adding one trips this suite", () => {
    expect(NEVER_EMITTED_FLAGS).toContain("--allow-incomplete-presentation");
    expect(NEVER_EMITTED_FLAGS).toContain("--allow-missing-assets");
    expect(NEVER_EMITTED_FLAGS).toContain("--admin-key");
  });
});

describe("validation", () => {
  it("refuses an empty selection", () => {
    const built = buildContentCommand(base({ questionIds: [] }));
    expect(built.errors).toContain("Select at least one question.");
    expect(built.command).toBe("");
  });

  it("refuses an empty format or state selection", () => {
    expect(buildContentCommand(base({ formats: [] })).errors).toContain(
      "Select at least one format.",
    );
    expect(buildContentCommand(base({ states: [] })).errors).toContain(
      "Select at least one render state.",
    );
  });

  it("does not require states when a post type defines the slides", () => {
    expect(buildContentCommand(base({ states: [], post: "single-question" })).errors).toEqual([]);
  });

  it("refuses a selection larger than the runner's batch maximum", () => {
    const ids = Array.from({ length: MAX_BATCH_LIMIT + 1 }, (_, i) => i + 1);
    const built = buildContentCommand(base({ questionIds: ids }));
    expect(built.errors[0]).toContain(`maximum is ${MAX_BATCH_LIMIT}`);
    expect(built.command).toBe("");
  });

  it("accepts exactly the batch maximum", () => {
    const ids = Array.from({ length: MAX_BATCH_LIMIT }, (_, i) => i + 1);
    expect(buildContentCommand(base({ questionIds: ids })).errors).toEqual([]);
  });

  it("emits no partial command when anything is invalid", () => {
    const built = buildContentCommand(base({ formats: ["nope"], questionIds: [] }));
    expect(built.args).toEqual([]);
    expect(built.command).toBe("");
    expect(built.errors.length).toBeGreaterThan(1);
  });
});
