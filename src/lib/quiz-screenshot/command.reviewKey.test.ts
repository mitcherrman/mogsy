/**
 * CON1 Step 3B — the review-key command, proved against the REAL parser.
 *
 * Phase 0 of Step 2 found the originally suggested handoff command invalid
 * because it named no source. A builder therefore cannot be reviewed for
 * correctness; it has to be run through `parseScreenshotCli`. Every case here
 * does that, and the shell-tokenizing case runs the copyable STRING through a
 * real `/bin/sh` first, so the quoting of a key containing a space or an
 * apostrophe cannot silently change what the parser receives.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  NEVER_EMITTED_FLAGS,
  buildContentCommand,
  type ContentCommandConfig,
} from "./command";
import { parseScreenshotCli } from "./cli";
import { DEFAULT_FORMAT_KEYS, DEFAULT_STATES, MAX_BATCH_LIMIT } from "./cli";

const KEY_A = "mastery:ssm.base.BARRIER";
const KEY_B = "mastery:ssm.combined.BARRIER.cosmic-insight+ionian-boots-of-lucidity";

const base: ContentCommandConfig = {
  questionIds: [],
  reviewKeys: [KEY_A],
  formats: [...DEFAULT_FORMAT_KEYS],
  states: [...DEFAULT_STATES],
  post: null,
  difficulty: null,
  runId: null,
  overwrite: false,
};

/** Split a shell line the way the operator's shell would. */
function shellSplit(command: string): string[] {
  const script = `printf '%s\\n' ${command.replace(/^npm run quiz:screenshots -- /, "")}`;
  return execFileSync("/bin/sh", ["-c", script], { encoding: "utf8" })
    .split("\n")
    .filter((s) => s !== "");
}

describe("--review-key command", () => {
  it("emits --review-key for one key and --review-keys for several", () => {
    expect(buildContentCommand(base).args.slice(0, 2)).toEqual(["--review-key", KEY_A]);
    const many = buildContentCommand({ ...base, reviewKeys: [KEY_A, KEY_B] });
    expect(many.args.slice(0, 2)).toEqual(["--review-keys", `${KEY_A},${KEY_B}`]);
  });

  it("preserves the selection order and never sorts it", () => {
    const built = buildContentCommand({ ...base, reviewKeys: [KEY_B, KEY_A] });
    const parsed = parseScreenshotCli(built.args);
    expect(parsed.source).toEqual({ mode: "review-key", keys: [KEY_B, KEY_A] });
  });

  it("round-trips through the REAL parser, and through a real shell first", () => {
    const built = buildContentCommand({
      ...base,
      reviewKeys: [KEY_A, KEY_B],
      formats: ["landscape"],
      states: ["explanation"],
      difficulty: "diamond",
      runId: "mastery_drop-1",
      overwrite: true,
    });
    expect(built.errors).toEqual([]);
    // The shell must hand the parser back exactly the argv the builder meant.
    expect(shellSplit(built.command)).toEqual(built.args);
    const parsed = parseScreenshotCli(shellSplit(built.command));
    expect(parsed.source).toEqual({ mode: "review-key", keys: [KEY_A, KEY_B] });
    expect(parsed.states).toEqual(["explanation"]);
    expect(parsed.formats.map((f) => f.key)).toEqual(["landscape"]);
    expect(parsed.difficulty).toBe("diamond");
    expect(parsed.runId).toBe("mastery_drop-1");
    expect(parsed.overwrite).toBe(true);
  });

  it("is deterministic — the same config yields a byte-identical line", () => {
    const a = buildContentCommand({ ...base, reviewKeys: [KEY_A, KEY_B] });
    const b = buildContentCommand({ ...base, reviewKeys: [KEY_A, KEY_B] });
    expect(a.command).toBe(b.command);
  });

  it("still never emits a credential or a gate override", () => {
    const built = buildContentCommand({ ...base, reviewKeys: [KEY_A, KEY_B] });
    for (const flag of NEVER_EMITTED_FLAGS) expect(built.command).not.toContain(flag);
    const parsed = parseScreenshotCli(built.args);
    expect(parsed.allowIncompletePresentation).toBe(false);
    expect(parsed.allowMissingAssets).toBe(false);
    expect(parsed.adminKey).toBeUndefined();
    expect(parsed.api).toBeUndefined();
  });

  it("refuses a selection mixing stored ids with review keys", () => {
    const built = buildContentCommand({ ...base, questionIds: [41], reviewKeys: [KEY_A] });
    expect(built.command).toBe("");
    expect(built.errors[0]).toMatch(/mutually exclusive/);
  });

  it("refuses a non-publishable key rather than emitting a command for it", () => {
    const built = buildContentCommand({ ...base, reviewKeys: ["family:item_cost"] });
    expect(built.args).toEqual([]);
    expect(built.errors.join(" ")).toMatch(/Definition only/i);
  });

  it("refuses a key containing the list separator", () => {
    const built = buildContentCommand({ ...base, reviewKeys: ["mastery:a,b"] });
    expect(built.args).toEqual([]);
    expect(built.errors.join(" ")).toMatch(/comma/i);
  });

  it("refuses more keys than the runner's maximum", () => {
    const many = Array.from({ length: MAX_BATCH_LIMIT + 1 }, (_, i) => `mastery:ssm.base.K${i}`);
    const built = buildContentCommand({ ...base, reviewKeys: many });
    expect(built.args).toEqual([]);
    expect(built.errors.join(" ")).toContain(String(MAX_BATCH_LIMIT));
  });

  it("leaves the stored-id command byte-identical", () => {
    const stored = buildContentCommand({ ...base, reviewKeys: [], questionIds: [41] });
    expect(stored.command).toBe(
      'npm run quiz:screenshots -- --question-id 41 --states "question,correct" ' +
        "--formats mobile-social",
    );
  });
});

describe("parseScreenshotCli source exclusivity", () => {
  it("refuses --review-key together with --question-id", () => {
    expect(() =>
      parseScreenshotCli(["--question-id", "41", "--review-key", KEY_A]),
    ).toThrow(/Conflicting question sources/);
  });

  it("refuses --review-key together with --review-keys", () => {
    expect(() =>
      parseScreenshotCli(["--review-key", KEY_A, "--review-keys", KEY_B]),
    ).toThrow(/Conflicting question sources/);
  });

  it("names --review-key in the no-source error", () => {
    expect(() => parseScreenshotCli(["--formats", "landscape"])).toThrow(/--review-key/);
  });

  it("refuses a duplicate key in --review-keys", () => {
    expect(() => parseScreenshotCli(["--review-keys", `${KEY_A},${KEY_A}`])).toThrow(
      /duplicates/,
    );
  });

  it("refuses a definition key at the CLI, not only in Admin", () => {
    expect(() => parseScreenshotCli(["--review-key", "family:item_cost"])).toThrow(
      /Definition only/i,
    );
  });

  it("documents both flags in the usage text", () => {
    // Imported lazily so the assertion reads against the same module the
    // runner prints.
    return import("./cli").then(({ CLI_USAGE }) => {
      expect(CLI_USAGE).toContain("--review-key <key>");
      expect(CLI_USAGE).toContain("--review-keys <key,key,...>");
    });
  });
});
