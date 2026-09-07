/**
 * CON1 Step 5 — a Pro Play specimen key travels the whole handoff, unchanged.
 *
 * The keys are the LONGEST and most punctuation-heavy the review vocabulary
 * has ever carried: they hold spaces, pipes, dots, apostrophes and their own
 * `;`/`=` delimiters, and they routinely run past 100 characters. Every one of
 * those is a way a key can arrive at the backend as a DIFFERENT key and
 * silently resolve to a different question — which is the failure this file
 * exists to make impossible.
 *
 * Nothing here is a new mechanism. Step 3B built the transport; these are the
 * cases the Pro Play grammar adds to it.
 */
import { describe, expect, it } from "vitest";

import { buildContentCommand, DEFAULT_CONTENT_COMMAND_CONFIG } from "./command";
import { parseScreenshotCli } from "./cli";
import { normalizeReviewKeys, reviewKeySupport } from "./reviewSource";
import {
  encodeContentHandoffParams,
  validateContentHandoff,
  CONTENT_HANDOFF_VERSION_V2,
  type ContentHandoff,
} from "@/lib/content-handoff/schema";
import { validateStudioJob } from "./studio-request";
import fixture from "../../../scripts/quiz-screenshots/visual-qa-fixture.json";

const rows = (fixture as { questions: Array<Record<string, unknown>> }).questions;
/** The real keys, taken from the fixture the resolver produced. */
const PRO_KEYS = rows
  .filter((q) => q.source_kind === "pro_question")
  .map((q) => String(q.review_key));

/** A v2 handoff carrying exactly these review keys, in order. */
const handoffOf = (keys: string[]): ContentHandoff => ({
  version: CONTENT_HANDOFF_VERSION_V2,
  items: keys.map((value) => ({ kind: "review-key" as const, value })),
  questionIds: [],
  reviewKeys: keys,
  formats: ["mobile-social"],
  states: ["question"],
  post: null,
  difficulty: null,
  runId: null,
  overwrite: false,
});

describe("Pro Play review keys — the transport", () => {
  it("the fixture really does carry the awkward characters", () => {
    // If this ever stops being true the rest of the file is testing nothing.
    expect(PRO_KEYS.length).toBeGreaterThanOrEqual(3);
    expect(PRO_KEYS.some((k) => k.includes(" "))).toBe(true);
    expect(PRO_KEYS.some((k) => k.includes("|"))).toBe(true);
    expect(PRO_KEYS.every((k) => k.includes(";") && k.includes("="))).toBe(true);
    expect(Math.max(...PRO_KEYS.map((k) => k.length))).toBeGreaterThan(80);
  });

  it.each(PRO_KEYS)("%s is accepted by the grammar", (key) => {
    const support = reviewKeySupport(key);
    expect("code" in support && support.code).toBeFalsy();
  });

  it("survives the CLI as bytes, through a real shell tokenizer", () => {
    // The operator copies a STRING. If quoting were wrong, a key with a space
    // would arrive as two arguments and the run would fetch something else.
    const built = buildContentCommand({
      ...DEFAULT_CONTENT_COMMAND_CONFIG,
      reviewKeys: PRO_KEYS,
      formats: ["mobile-social"],
      states: ["question", "correct"],
    });
    expect(built.errors).toEqual([]);
    // Tokenize the way a shell would: honour single and double quotes.
    const argv = (built.command.match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map((t) =>
      t.replace(/^['"]|['"]$/g, ""),
    );
    const parsed = parseScreenshotCli(argv.slice(argv.indexOf("--") + 1));
    expect(parsed.source.mode).toBe("review-key");
    if (parsed.source.mode === "review-key") {
      expect(parsed.source.keys).toEqual(PRO_KEYS);
    }
    // And the argv the builder itself hands over agrees with the string.
    expect(parseScreenshotCli(built.args).source).toEqual(parsed.source);
  });

  it("round-trips through the v2 handoff, byte for byte and in order", () => {
    const query = encodeContentHandoffParams(handoffOf(PRO_KEYS));
    const back = validateContentHandoff(
      Object.fromEntries(new URLSearchParams(query)),
    );
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.handoff.version).toBe(CONTENT_HANDOFF_VERSION_V2);
    expect(back.handoff.reviewKeys).toEqual(PRO_KEYS);
    // Order is the selection, never sorted.
    expect(back.handoff.items.map((i) => i.value)).toEqual(PRO_KEYS);
  });

  it("escapes what a URL would otherwise eat", () => {
    const key = "pro:champion-scope;k=A B|ALL|1.0;m=picks;s=pairwise";
    const query = encodeContentHandoffParams(handoffOf([key]));
    // A bare space or a bare `;` in a query value is how a key becomes a
    // different key; `;` is a legal query SEPARATOR in some parsers, and a
    // bare space cannot survive a URL at all.
    expect(query).not.toMatch(/ /);
    expect(query).not.toMatch(/[^%]3B/i);
    expect(query).toContain("%3B");
    const back = validateContentHandoff(
      Object.fromEntries(new URLSearchParams(query)),
    );
    expect(back.ok && back.handoff.reviewKeys[0]).toBe(key);
  });

  it("normalizes to a de-duplicated, order-preserving selection", () => {
    const errors: string[] = [];
    const keys = normalizeReviewKeys([PRO_KEYS[0], PRO_KEYS[1], PRO_KEYS[0]], errors);
    expect(errors).toEqual([]);
    expect(keys).toEqual([PRO_KEYS[0], PRO_KEYS[1]]);
  });

  it("is accepted by the Content Workspace job, and stays exclusive", () => {
    const ok = validateStudioJob({
      mode: "classic",
      questionIds: [],
      reviewKeys: PRO_KEYS,
      formats: ["mobile-social"],
      states: ["question"],
    });
    expect(ok.ok, JSON.stringify((ok as { errors?: string[] }).errors)).toBe(true);

    // The Step 3B invariant: one source per job.
    const mixed = validateStudioJob({
      mode: "classic",
      reviewKeys: [PRO_KEYS[0]],
      questionIds: ["41"],
      formats: ["mobile-social"],
      states: ["question"],
    });
    expect(mixed.ok).toBe(false);
  });

  it("refuses a comma-bearing key rather than splitting it", () => {
    // `--review-keys` separates on commas, so a key containing one cannot
    // travel. The grammar refuses it up front instead of shipping half a key.
    const support = reviewKeySupport(
      "pro:champion-scope;k=A,B|ALL|1.0;m=picks;s=pairwise",
    );
    expect("code" in support && support.code).toBeTruthy();
  });
});
