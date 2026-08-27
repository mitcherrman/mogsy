/**
 * Structural side-effect boundary for the question preview.
 *
 * The preview's guarantee is that it CANNOT create a match, submit an answer,
 * score, rate, heartbeat, or persist anything — and the way that guarantee is
 * made is structural: the preview subtree does not import the Ranked match or
 * queue controllers, the ranked-public client, or the broadcast engine at all.
 *
 * A `previewMode` flag threaded through the production controllers would be the
 * fragile alternative — one forgotten branch and a preview writes to a live
 * match. These assertions fail the moment such an import appears, which is
 * cheaper than discovering it in production.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

/**
 * The preview's ONE network file. It is held to every rule below except the
 * ban on `fetch` — being the single, audited place the subtree touches the
 * network is its entire job. Isolating it to one named file is what makes
 * "no raw fetch" meaningful for everything else.
 */
const PREVIEW_CLIENT = "lib/question-preview/questionPreviewApi.ts";

/** Every other file in the preview subtree, plus its host component. */
const PREVIEW_CONSUMERS = [
  "lib/question-preview/rankedPreviewAdapter.ts",
  "lib/question-preview/useExactRankedQuestion.ts",
  "lib/question-preview/usePreviewInteractionState.ts",
  "lib/question-preview/previewViewport.ts",
  "components/question-preview/PreviewStage.tsx",
  "components/question-preview/PreviewStateControl.tsx",
  "components/question-preview/PreviewViewportControl.tsx",
  "components/question-preview/QuestionPreviewPanel.tsx",
];

const PREVIEW_FILES = [...PREVIEW_CONSUMERS, PREVIEW_CLIENT];

const codeOf = (rel: string): string =>
  readFileSync(path.join(root, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const FORBIDDEN_IMPORTS: Array<[string, RegExp]> = [
  ["useRankedMatch", /\buseRankedMatch\b/],
  ["useRankedQueue", /\buseRankedQueue\b/],
  ["ranked-public client", /ranked-public\/client/],
  ["broadcast engine", /broadcast\/(engine|session|channel|live-?sync)/i],
  ["broadcast renderer", /BroadcastRenderer/],
];

const FORBIDDEN_CALLS: Array<[string, RegExp]> = [
  ["a ranked match endpoint", /\/api\/ranked\/matches/],
  ["the ranked queue", /\/api\/ranked\/queue/],
  ["a websocket", /new\s+WebSocket/],
  ["supabase", /\bsupabase\b/i],
  ["local persistence", /\b(localStorage|sessionStorage|indexedDB)\b/],
];

/** Applies to consumers only — the client is the one place a fetch belongs. */
const NO_NETWORK: Array<[string, RegExp]> = [["a raw fetch", /\bfetch\s*\(/]];

const MUTATION_METHODS = /method:\s*["'](POST|PUT|PATCH|DELETE)["']/;

describe("candidate preview side-effect boundary", () => {
  it.each(PREVIEW_FILES)("%s imports no live Ranked controller", (file) => {
    const src = codeOf(file);
    for (const [label, pattern] of FORBIDDEN_IMPORTS) {
      expect(pattern.test(src), `${file} referenced ${label}`).toBe(false);
    }
  });

  it.each(PREVIEW_FILES)("%s performs no direct side effect", (file) => {
    const src = codeOf(file);
    for (const [label, pattern] of FORBIDDEN_CALLS) {
      expect(pattern.test(src), `${file} performed ${label}`).toBe(false);
    }
    expect(MUTATION_METHODS.test(src), `${file} issued a mutation`).toBe(false);
  });

  it.each(PREVIEW_CONSUMERS)("%s reaches the network only via the client", (file) => {
    const src = codeOf(file);
    for (const [label, pattern] of NO_NETWORK) {
      expect(pattern.test(src), `${file} performed ${label}`).toBe(false);
    }
  });

  it("keeps the whole subtree to exactly one network file", () => {
    const fetchers = PREVIEW_FILES.filter((f) => /\bfetch\s*\(/.test(codeOf(f)));
    expect(fetchers).toEqual([PREVIEW_CLIENT]);
  });

  it("reaches the backend through exactly one endpoint", () => {
    const loader = codeOf("lib/question-preview/useExactRankedQuestion.ts");
    // The single API call in the whole subtree, and it is a documented read.
    expect(loader).toMatch(/questionPreviewApi\s*\.\s*rankedCandidateView/);

    for (const file of PREVIEW_FILES) {
      if (file.endsWith("useExactRankedQuestion.ts")) continue;
      if (file.endsWith("questionPreviewApi.ts")) continue;
      expect(codeOf(file)).not.toContain("questionPreviewApi");
    }
  });

  it("cannot express a mutation at all, rather than merely not writing one", () => {
    // Stronger than asserting the absence of `method: "POST"`: the client has
    // no `method` parameter, so a future caller cannot ask it to mutate. This
    // replaced the retired review client, whose accept/reject/revise/export
    // calls sat one property away from the preview.
    const api = codeOf("lib/question-preview/questionPreviewApi.ts");
    expect(api).toMatch(/method:\s*"GET"/);
    for (const forbidden of [/\baccept\b/, /\breject\b/, /\brevise\b/, /\bvalidate\b/]) {
      expect(forbidden.test(api), `preview client exposed ${forbidden}`).toBe(false);
    }
  });

  it("retains no import of the retired Ranked Duel Review client", () => {
    for (const file of PREVIEW_FILES) {
      expect(codeOf(file)).not.toContain("ranked-duel-review");
    }
  });

  it("computes no score, rating, or damage", () => {
    for (const file of PREVIEW_FILES) {
      const src = codeOf(file);
      for (const pattern of [
        /\belo\b/i,
        /\brating\b/i,
        /\bscore\b/i,
        /\bdamage\b/i,
        /heartbeat/i,
        /matchmak/i,
      ]) {
        expect(pattern.test(src), `${file} matched ${pattern}`).toBe(false);
      }
    }
  });

  it("offers no way to act on the question it previews", () => {
    // The preview is a way to LOOK at a question, never a second way to decide
    // on one. With the review workflow retired there is no decision call left
    // to leak, and this keeps it that way.
    const host = codeOf("components/question-preview/QuestionPreviewPanel.tsx");
    for (const pattern of [/\baccept\b/, /\breject\b/, /\brevise\b/, /\bexport\(/]) {
      expect(pattern.test(host), `QuestionPreviewPanel matched ${pattern}`).toBe(false);
    }
  });
});
