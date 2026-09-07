/**
 * CON1 Step 3B — the v2 handoff: ordered, typed sources.
 *
 * Two properties matter most and are asserted against the other side rather
 * than restated:
 *
 *  1. A stored-only selection still serializes as v1, byte for byte. Step 3A's
 *     proof is not re-litigated; it is re-run.
 *  2. Whatever a handoff accepts is a legal local job — `studioJobBodyFromHandoff`
 *     is fed to `validateStudioJob`, the local server's own validator.
 */
import { describe, expect, it } from "vitest";
import { isFailure } from "../result-narrowing";
import {
  CONTENT_HANDOFF_VERSION,
  CONTENT_HANDOFF_VERSION_V2,
  contentHandoffFromCommandConfig,
  decodeContentHandoffParams,
  encodeContentHandoffParams,
  hasContentHandoffParams,
  parseContentHandoffText,
  serializeContentHandoff,
  studioJobBodyFromHandoff,
  validateContentHandoff,
  type ContentHandoff,
} from "./schema";
import { validateStudioJob } from "../quiz-screenshot/studio-request";
import { buildContentCommand } from "../quiz-screenshot/command";
import { DEFAULT_FORMAT_KEYS, DEFAULT_STATES } from "../quiz-screenshot/cli";

const KEY_A = "mastery:ssm.base.BARRIER";
const KEY_B = "mastery:ssm.combined.BARRIER.cosmic-insight+ionian-boots-of-lucidity";

const ok = (r: ReturnType<typeof validateContentHandoff>): ContentHandoff => {
  if (isFailure(r)) throw new Error(`expected ok, got: ${r.errors.join("; ")}`);
  return r.handoff;
};
const errs = (r: ReturnType<typeof validateContentHandoff>): string[] => {
  if (!isFailure(r)) throw new Error("expected a rejection");
  return r.errors;
};

const CONFIG = {
  questionIds: [] as number[],
  reviewKeys: [KEY_A, KEY_B],
  formats: [...DEFAULT_FORMAT_KEYS],
  states: [...DEFAULT_STATES],
  post: null,
  difficulty: null,
  runId: null,
  overwrite: false,
};

describe("v1 back-compatibility", () => {
  it("a stored-only selection is still v1 on both wire forms", () => {
    const h = ok(contentHandoffFromCommandConfig({ ...CONFIG, reviewKeys: [], questionIds: [41, 7] }));
    expect(h.version).toBe(CONTENT_HANDOFF_VERSION);
    expect(h.reviewKeys).toEqual([]);
    expect(encodeContentHandoffParams(h)).toBe(
      "hv=1&ids=41,7&formats=mobile-social&states=question,correct",
    );
    // The v1 invariant Step 3A proved: a valid stored handoff URL contains no
    // percent escape at all. Only a review key can force one.
    expect(encodeContentHandoffParams(h)).not.toContain("%");
    expect(JSON.parse(serializeContentHandoff(h)).items).toBeUndefined();
    expect(JSON.parse(serializeContentHandoff(h)).questionIds).toEqual(["41", "7"]);
  });

  it("an existing v1 URL still parses, and is upgraded into typed items", () => {
    const h = ok(decodeContentHandoffParams("hv=1&ids=41,7,103&formats=square"));
    expect(h.version).toBe(CONTENT_HANDOFF_VERSION);
    expect(h.questionIds).toEqual(["41", "7", "103"]);
    expect(h.items).toEqual([
      { kind: "question-id", value: "41" },
      { kind: "question-id", value: "7" },
      { kind: "question-id", value: "103" },
    ]);
  });

  it("an existing v1 JSON payload still parses", () => {
    const h = ok(parseContentHandoffText(JSON.stringify({ version: 1, questionIds: ["41"] })));
    expect(h.questionIds).toEqual(["41"]);
  });
});

describe("v2 review-key handoff", () => {
  it("serializes an ordered review-key selection as v2", () => {
    const h = ok(contentHandoffFromCommandConfig(CONFIG));
    expect(h.version).toBe(CONTENT_HANDOFF_VERSION_V2);
    expect(h.reviewKeys).toEqual([KEY_A, KEY_B]);
    expect(h.questionIds).toEqual([]);
    expect(h.items).toEqual([
      { kind: "review-key", value: KEY_A },
      { kind: "review-key", value: KEY_B },
    ]);
  });

  it("percent-encodes a key's own colons and '+' so the tag split is unambiguous", () => {
    const query = encodeContentHandoffParams(ok(contentHandoffFromCommandConfig(CONFIG)));
    expect(query).toContain("hv=2");
    // The '+' in a real concept id MUST be escaped: URLSearchParams decodes a
    // bare '+' as a space, which would silently rename the question.
    expect(query).toContain("%2B");
    expect(query).not.toMatch(/items=[^&]*[^%]\+/);
    const round = ok(decodeContentHandoffParams(query));
    expect(round.reviewKeys).toEqual([KEY_A, KEY_B]);
  });

  it("is deterministic on both wire forms", () => {
    const a = ok(contentHandoffFromCommandConfig(CONFIG));
    const b = ok(contentHandoffFromCommandConfig(CONFIG));
    expect(encodeContentHandoffParams(a)).toBe(encodeContentHandoffParams(b));
    expect(serializeContentHandoff(a)).toBe(serializeContentHandoff(b));
  });

  it("preserves order through the URL and through the JSON payload", () => {
    const reversed = ok(contentHandoffFromCommandConfig({ ...CONFIG, reviewKeys: [KEY_B, KEY_A] }));
    expect(ok(decodeContentHandoffParams(encodeContentHandoffParams(reversed))).reviewKeys).toEqual([
      KEY_B,
      KEY_A,
    ]);
    expect(ok(parseContentHandoffText(serializeContentHandoff(reversed))).reviewKeys).toEqual([
      KEY_B,
      KEY_A,
    ]);
  });

  it("describes the same work as the Copy-command line", () => {
    const built = buildContentCommand(CONFIG);
    const h = ok(contentHandoffFromCommandConfig(CONFIG));
    const flagValue = built.args[built.args.indexOf("--review-keys") + 1];
    expect(flagValue).toBe(h.reviewKeys.join(","));
  });

  it("is recognised as a handoff by the URL sniffer", () => {
    expect(hasContentHandoffParams(encodeContentHandoffParams(ok(contentHandoffFromCommandConfig(CONFIG))))).toBe(true);
  });

  it("accepts the object item form as well as the tagged URL form", () => {
    const h = ok(
      validateContentHandoff({
        version: 2,
        items: [{ kind: "review-key", value: KEY_A }],
      }),
    );
    expect(h.reviewKeys).toEqual([KEY_A]);
  });
});

describe("v2 rejections", () => {
  it("rejects a family definition as a selection", () => {
    expect(
      errs(validateContentHandoff({ version: 2, items: [{ kind: "review-key", value: "family:x" }] })).join(" "),
    ).toMatch(/Definition only/i);
  });

  it("rejects a Meta Reflex rule", () => {
    expect(
      errs(
        validateContentHandoff({
          version: 2,
          items: [{ kind: "review-key", value: "meta-rule:attack_type:melee" }],
        }),
      ).join(" "),
    ).toMatch(/Definition only/i);
  });

  it("rejects a mixed selection, and says why", () => {
    expect(
      errs(
        validateContentHandoff({
          version: 2,
          items: [
            { kind: "question-id", value: "41" },
            { kind: "review-key", value: KEY_A },
          ],
        }),
      ).join(" "),
    ).toMatch(/mutually exclusive/);
  });

  it("rejects a payload carrying both items and questionIds", () => {
    expect(
      errs(validateContentHandoff({ version: 2, items: [], questionIds: ["41"] })).join(" "),
    ).toMatch(/one selection, one list/);
  });

  it("rejects a payload that calls itself v1 while carrying a review key", () => {
    expect(
      errs(validateContentHandoff({ version: 1, items: [{ kind: "review-key", value: KEY_A }] })).join(" "),
    ).toMatch(/declares v1/);
  });

  it("rejects an unsupported version", () => {
    expect(errs(validateContentHandoff({ version: 3, questionIds: ["41"] })).join(" ")).toMatch(
      /not supported/,
    );
  });

  it("rejects an unknown item kind", () => {
    expect(
      errs(validateContentHandoff({ version: 2, items: [{ kind: "generator", value: "x" }] })).join(" "),
    ).toMatch(/Unknown handoff item kind/);
  });

  it("rejects an unknown URL tag", () => {
    expect(errs(decodeContentHandoffParams("hv=2&items=gen:x")).join(" ")).toMatch(
      /Unknown handoff item tag/,
    );
  });

  it("still refuses a forbidden field beside a v2 selection", () => {
    expect(
      errs(
        validateContentHandoff({
          version: 2,
          items: [{ kind: "review-key", value: KEY_A }],
          adminKey: "sekrit",
        }),
      ).join(" "),
    ).toMatch(/forbidden field/);
  });
});

describe("the handoff is a legal local job", () => {
  it("a review-key handoff validates through validateStudioJob", () => {
    const h = ok(contentHandoffFromCommandConfig(CONFIG));
    const body = studioJobBodyFromHandoff(h);
    expect(body.reviewKeys).toEqual([KEY_A, KEY_B]);
    expect(body.questionIds).toEqual([]);
    const validated = validateStudioJob(body);
    expect(isFailure(validated)).toBe(false);
    if (!isFailure(validated)) expect(validated.request.reviewKeys).toEqual([KEY_A, KEY_B]);
  });

  it("a review-key handoff validates in every post mode it can name", () => {
    for (const post of [null, "single-question", "answer-reveal"] as const) {
      const h = ok(contentHandoffFromCommandConfig({ ...CONFIG, post }));
      expect(isFailure(validateStudioJob(studioJobBodyFromHandoff(h))), String(post)).toBe(false);
    }
  });

  it("a stored handoff still carries no reviewKeys field at all", () => {
    const h = ok(contentHandoffFromCommandConfig({ ...CONFIG, reviewKeys: [], questionIds: [41] }));
    expect(studioJobBodyFromHandoff(h).reviewKeys).toBeUndefined();
  });
});
