/**
 * Structural side-effect boundary for the candidate preview (RA9).
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

/** Every file in the preview subtree, plus its admin host component. */
const PREVIEW_FILES = [
  "lib/question-preview/rankedPreviewAdapter.ts",
  "lib/question-preview/useExactRankedQuestion.ts",
  "lib/question-preview/usePreviewInteractionState.ts",
  "lib/question-preview/previewViewport.ts",
  "components/question-preview/PreviewStage.tsx",
  "components/question-preview/PreviewStateControl.tsx",
  "components/question-preview/PreviewViewportControl.tsx",
  "components/admin/ranked-duel-review/CandidatePreview.tsx",
];

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
  ["a raw fetch", /\bfetch\s*\(/],
  ["a websocket", /new\s+WebSocket/],
  ["supabase", /\bsupabase\b/i],
  ["local persistence", /\b(localStorage|sessionStorage|indexedDB)\b/],
];

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

  it("reaches the backend through exactly one endpoint", () => {
    const loader = codeOf("lib/question-preview/useExactRankedQuestion.ts");
    // The single API call in the whole subtree, and it is a documented read.
    expect(loader).toMatch(/rankedReviewApi\s*\.\s*candidatePublicView/);
    expect(loader).not.toMatch(
      /rankedReviewApi\s*\.\s*(accept|reject|revise|export|validate)/,
    );

    for (const file of PREVIEW_FILES) {
      if (file.endsWith("useExactRankedQuestion.ts")) continue;
      expect(codeOf(file)).not.toContain("rankedReviewApi");
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

  it("keeps the review client's mutations out of the preview host", () => {
    // The Preview tab is a sibling of the Data tab, never a second way to act
    // on a candidate: the decision calls stay in the panel.
    const host = codeOf("components/admin/ranked-duel-review/CandidatePreview.tsx");
    for (const pattern of [/\baccept\b/, /\breject\b/, /\brevise\b/, /\bexport\(/]) {
      expect(pattern.test(host), `CandidatePreview matched ${pattern}`).toBe(false);
    }
  });
});
