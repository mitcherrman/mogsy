/**
 * CON1 Step 3A — the Admin → Content Workspace handoff contract.
 *
 * What is being held:
 *   1. an Admin selection serializes into a handoff, and the ORDER of that
 *      selection is the order that comes back — on both wire forms;
 *   2. both wire forms round-trip byte-deterministically;
 *   3. an invalid id, format, state, tier or run name is refused with a
 *      readable reason, never coerced;
 *   4. NO secret, backend URL or diagnostic gate override can travel — asserted
 *      against the command builder's own `NEVER_EMITTED_FLAGS`, so the two
 *      surfaces cannot disagree about what is forbidden;
 *   5. everything a handoff accepts is a legal seed for the LOCAL SERVER's own
 *      validator (`validateStudioJob`) — the contract is proved against the
 *      authority, not restated.
 */

import { describe, expect, it } from "vitest";
import {
  CONTENT_HANDOFF_VERSION,
  HANDOFF_FORBIDDEN_KEYS,
  contentHandoffFromCommandConfig,
  decodeContentHandoffParams,
  encodeContentHandoffParams,
  hasContentHandoffParams,
  parseContentHandoffText,
  serializeContentHandoff,
  studioJobBodyFromHandoff,
  studioModeForHandoff,
  validateContentHandoff,
  type ContentHandoff,
} from "./schema";
import {
  NEVER_EMITTED_FLAGS,
  buildContentCommand,
  type ContentCommandConfig,
} from "@/lib/quiz-screenshot/command";
import { validateStudioJob, STUDIO_MODES } from "@/lib/quiz-screenshot/studio-request";
import { POST_TYPES } from "@/lib/quiz-screenshot/content-posts";
import { DEFAULT_FORMAT_KEYS, DEFAULT_STATES, MAX_BATCH_LIMIT } from "@/lib/quiz-screenshot/cli";
import { isFailure } from "@/lib/result-narrowing";

const ok = (r: ReturnType<typeof validateContentHandoff>): ContentHandoff => {
  if (isFailure(r)) throw new Error(`expected ok, got: ${r.errors.join("; ")}`);
  return r.handoff;
};
const errs = (r: ReturnType<typeof validateContentHandoff>): string[] => {
  if (!isFailure(r)) throw new Error("expected failure");
  return r.errors;
};

const CONFIG: ContentCommandConfig = {
  questionIds: [41, 7, 103],
  formats: ["mobile-social", "square"],
  states: ["question", "correct"],
  post: null,
  difficulty: "gold",
  runId: "weekly_drop-2",
  overwrite: true,
};

describe("handoff from an Admin selection", () => {
  it("serializes the Admin command configuration into a handoff", () => {
    const h = ok(contentHandoffFromCommandConfig(CONFIG));
    expect(h).toEqual({
      version: CONTENT_HANDOFF_VERSION,
      // CON1 Step 3B — `items` is the canonical ordered selection; the two
      // per-kind lists below are derived from it. A stored-only selection is
      // still v1, so nothing about the wire form changed.
      items: [
        { kind: "question-id", value: "41" },
        { kind: "question-id", value: "7" },
        { kind: "question-id", value: "103" },
      ],
      questionIds: ["41", "7", "103"],
      reviewKeys: [],
      formats: ["mobile-social", "square"],
      post: null,
      states: ["question", "correct"],
      difficulty: "gold",
      runId: "weekly_drop-2",
      overwrite: true,
    });
  });

  it("preserves the SELECTION ORDER, never sorting it, on both wire forms", () => {
    const h = ok(contentHandoffFromCommandConfig({ ...CONFIG, questionIds: [9, 2, 30, 1] }));
    expect(h.questionIds).toEqual(["9", "2", "30", "1"]);
    // ...through the URL...
    expect(ok(decodeContentHandoffParams(encodeContentHandoffParams(h))).questionIds).toEqual([
      "9", "2", "30", "1",
    ]);
    // ...and through the pasted payload.
    expect(ok(parseContentHandoffText(serializeContentHandoff(h))).questionIds).toEqual([
      "9", "2", "30", "1",
    ]);
  });

  it("carries the SAME selection as the copyable command", () => {
    const built = buildContentCommand(CONFIG);
    const h = ok(contentHandoffFromCommandConfig(CONFIG));
    const idsArg = built.args[built.args.indexOf("--question-ids") + 1];
    expect(idsArg).toBe(h.questionIds.join(","));
    expect(built.args[built.args.indexOf("--formats") + 1]).toBe(h.formats.join(","));
    expect(built.args[built.args.indexOf("--states") + 1]).toBe(h.states.join(","));
    expect(built.args[built.args.indexOf("--difficulty") + 1]).toBe(h.difficulty);
    expect(built.args[built.args.indexOf("--run-id") + 1]).toBe(h.runId);
  });

  it("drops the states when a post type is chosen — the CLI rejects the pair", () => {
    const h = ok(
      contentHandoffFromCommandConfig({ ...CONFIG, post: "answer-reveal" }),
    );
    expect(h.post).toBe("answer-reveal");
    expect(h.states).toEqual([]);
    expect(encodeContentHandoffParams(h)).not.toContain("states=");
  });
});

describe("deterministic serialization", () => {
  const h = ok(contentHandoffFromCommandConfig(CONFIG));

  it("is byte-identical for the same handoff, with a fixed key order", () => {
    expect(encodeContentHandoffParams(h)).toBe(encodeContentHandoffParams(h));
    expect(encodeContentHandoffParams(h)).toBe(
      "hv=1&ids=41,7,103&formats=mobile-social,square&states=question,correct" +
        "&difficulty=gold&run=weekly_drop-2&overwrite=1",
    );
    expect(serializeContentHandoff(h)).toBe(serializeContentHandoff(h));
  });

  it("needs no percent-encoding — every legal value is URL-safe by its own grammar", () => {
    expect(encodeContentHandoffParams(h)).not.toContain("%");
  });

  it("omits what is default or absent, so the shortest correct URL is the one built", () => {
    const minimal = ok(
      contentHandoffFromCommandConfig({
        questionIds: [5],
        formats: ["mobile-social"],
        states: ["question"],
      }),
    );
    expect(encodeContentHandoffParams(minimal)).toBe(
      "hv=1&ids=5&formats=mobile-social&states=question",
    );
  });

  it("round-trips through the URL and through the pasted payload identically", () => {
    expect(ok(decodeContentHandoffParams(encodeContentHandoffParams(h)))).toEqual(h);
    expect(ok(parseContentHandoffText(serializeContentHandoff(h)))).toEqual(h);
    // A full workspace URL pasted into the import box works too.
    expect(
      ok(parseContentHandoffText(`http://127.0.0.1:5199/dev/content-studio?${encodeContentHandoffParams(h)}`)),
    ).toEqual(h);
  });

  it("defaults an omitted format/state set to the RUNNER's defaults", () => {
    const h2 = ok(decodeContentHandoffParams("ids=41"));
    expect(h2.formats).toEqual([...DEFAULT_FORMAT_KEYS]);
    expect(h2.states).toEqual([...DEFAULT_STATES]);
  });

  it("detects whether a query string carries a handoff at all", () => {
    expect(hasContentHandoffParams("?ids=41")).toBe(true);
    expect(hasContentHandoffParams("")).toBe(false);
    expect(hasContentHandoffParams("?foo=1")).toBe(false);
  });
});

describe("rejection", () => {
  it("refuses an id the local server's own grammar would refuse", () => {
    expect(errs(validateContentHandoff({ questionIds: ["../etc/passwd"] })).join()).toMatch(
      /Invalid question id/,
    );
    expect(errs(decodeContentHandoffParams("ids=41,$(whoami)")).join()).toMatch(
      /Invalid question id/,
    );
  });

  it("refuses an empty selection rather than handing over an empty run", () => {
    expect(errs(validateContentHandoff({ questionIds: [] })).join()).toMatch(/selects no questions/);
  });

  it("refuses more than the runner's maximum, naming it", () => {
    const many = Array.from({ length: MAX_BATCH_LIMIT + 1 }, (_, i) => String(i + 1));
    expect(errs(validateContentHandoff({ questionIds: many })).join()).toContain(
      String(MAX_BATCH_LIMIT),
    );
  });

  it("refuses an unknown format, state, tier and post type by name", () => {
    expect(errs(validateContentHandoff({ questionIds: ["1"], formats: ["billboard"] })).join()).toMatch(
      /Unknown format "billboard"/,
    );
    expect(errs(validateContentHandoff({ questionIds: ["1"], states: ["gloating"] })).join()).toMatch(
      /Unknown state "gloating"/,
    );
    expect(
      errs(validateContentHandoff({ questionIds: ["1"], difficulty: "challenger" })).join(),
    ).toMatch(/Unknown difficulty "challenger"/);
    expect(errs(validateContentHandoff({ questionIds: ["1"], post: "story" })).join()).toMatch(
      /Unknown post type "story"/,
    );
  });

  it("refuses a run name that is a path, a command or a substitution", () => {
    for (const bad of ["../escape", "drop;rm -rf /", "$(whoami)", "a".repeat(65)]) {
      expect(errs(validateContentHandoff({ questionIds: ["1"], runId: bad })).join()).toMatch(
        /Invalid run name/,
      );
    }
  });

  it("refuses a post type combined with explicit states", () => {
    expect(
      errs(
        validateContentHandoff({
          questionIds: ["1"],
          post: "single-question",
          states: ["question"],
        }),
      ).join(),
    ).toMatch(/cannot carry both a post type/);
  });

  it("refuses a payload that is not an object, and unreadable JSON", () => {
    expect(errs(validateContentHandoff("41")).join()).toMatch(/must be a JSON object/);
    expect(errs(parseContentHandoffText("{oh no")).join()).toMatch(/Not valid JSON/);
    expect(errs(parseContentHandoffText("   ")).join()).toMatch(/Paste a handoff/);
  });

  it("refuses a wire version it does not speak", () => {
    expect(errs(decodeContentHandoffParams("hv=99&ids=41")).join()).toMatch(/version 99/);
  });
});

describe("no secrets, no environment, no gate overrides", () => {
  it("refuses — rather than strips — every forbidden key, on both wire forms", () => {
    for (const key of HANDOFF_FORBIDDEN_KEYS) {
      const viaJson = errs(validateContentHandoff({ questionIds: ["1"], [key]: "x" })).join();
      expect(viaJson).toMatch(/forbidden field/);
      expect(viaJson).toContain(key);
      const viaUrl = errs(decodeContentHandoffParams(`ids=1&${key}=x`)).join();
      expect(viaUrl).toMatch(/forbidden parameter/);
    }
  });

  it("matches a forbidden key however it is spelled", () => {
    for (const spelling of ["admin-key", "admin_key", "adminKey", "ADMINKEY", "base-url"]) {
      expect(errs(validateContentHandoff({ questionIds: ["1"], [spelling]: "x" })).join()).toMatch(
        /forbidden field/,
      );
    }
  });

  it("forbids exactly what the command builder refuses to emit", () => {
    // The two surfaces answer to the same list; a flag added to one and not the
    // other is the drift this asserts against.
    for (const flag of NEVER_EMITTED_FLAGS) {
      const key = flag.replace(/^--/, "").replace(/-/g, "");
      expect(HANDOFF_FORBIDDEN_KEYS).toContain(key);
    }
  });

  it("emits no forbidden name in either serialized form", () => {
    const h = ok(contentHandoffFromCommandConfig(CONFIG));
    const url = encodeContentHandoffParams(h).toLowerCase();
    const json = serializeContentHandoff(h).toLowerCase();
    for (const key of HANDOFF_FORBIDDEN_KEYS) {
      expect(url).not.toContain(key);
      expect(json).not.toContain(key);
    }
  });
});

describe("the handoff is a legal seed for the LOCAL server's own validator", () => {
  it("maps a states handoff to classic, and each post type to its own mode", () => {
    expect(studioModeForHandoff(ok(contentHandoffFromCommandConfig(CONFIG)))).toBe("classic");
    for (const post of POST_TYPES) {
      const h = ok(contentHandoffFromCommandConfig({ ...CONFIG, post }));
      expect(studioModeForHandoff(h)).toBe(post);
      // The post vocabularies are spelled identically in both registries.
      expect(STUDIO_MODES).toContain(post);
    }
  });

  it("produces a job body validateStudioJob accepts, for every mode it can seed", () => {
    for (const post of [null, ...POST_TYPES] as const) {
      const h = ok(contentHandoffFromCommandConfig({ ...CONFIG, post }));
      const validated = validateStudioJob(studioJobBodyFromHandoff(h));
      if (isFailure(validated)) throw new Error(`${post}: ${validated.errors.join("; ")}`);
      expect(validated.request.questionIds).toEqual(h.questionIds);
      expect(validated.request.formats).toEqual(h.formats);
      expect(validated.request.runId).toBe(h.runId);
      expect(validated.request.difficulty).toBe(h.difficulty);
    }
  });

  it("keeps order through the local server's validator too", () => {
    const h = ok(contentHandoffFromCommandConfig({ ...CONFIG, questionIds: [9, 2, 30, 1] }));
    const validated = validateStudioJob(studioJobBodyFromHandoff(h));
    if (isFailure(validated)) throw new Error(validated.errors.join("; "));
    expect(validated.request.questionIds).toEqual(["9", "2", "30", "1"]);
  });
});
