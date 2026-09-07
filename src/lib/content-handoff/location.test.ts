/**
 * CON1 Step 3A — the "Open Content Workspace" URL.
 *
 * What is being held:
 *   1. the URL is deterministic and points at loopback only — it can never be
 *      steered off-machine by the payload;
 *   2. it carries the handoff and nothing else, so the safety properties of
 *      `./schema` are the safety properties of the link;
 *   3. the port has ONE owner, shared with the server that listens on it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTENT_WORKSPACE_HOST,
  CONTENT_WORKSPACE_ORIGIN,
  CONTENT_WORKSPACE_PATH,
  CONTENT_WORKSPACE_PORT,
  buildContentWorkspaceUrl,
} from "./location";
import {
  contentHandoffFromCommandConfig,
  decodeContentHandoffParams,
  HANDOFF_FORBIDDEN_KEYS,
} from "./schema";
import { isFailure } from "@/lib/result-narrowing";

const handoffOf = (over: Parameters<typeof contentHandoffFromCommandConfig>[0]) => {
  const r = contentHandoffFromCommandConfig(over);
  if (isFailure(r)) throw new Error(r.errors.join("; "));
  return r.handoff;
};

const HANDOFF = handoffOf({
  questionIds: [41, 7],
  formats: ["mobile-social"],
  states: ["question", "correct"],
  post: null,
  difficulty: "gold",
  runId: "drop_1",
  overwrite: false,
});

describe("the workspace URL", () => {
  it("is deterministic", () => {
    expect(buildContentWorkspaceUrl(HANDOFF)).toBe(buildContentWorkspaceUrl(HANDOFF));
    expect(buildContentWorkspaceUrl(HANDOFF)).toBe(
      "http://127.0.0.1:5199/dev/content-studio" +
        "?hv=1&ids=41,7&formats=mobile-social&states=question,correct&difficulty=gold&run=drop_1",
    );
  });

  it("points at loopback, over plain http, at the workspace route — always", () => {
    const url = new URL(buildContentWorkspaceUrl(HANDOFF));
    expect(url.protocol).toBe("http:");
    expect(url.hostname).toBe(CONTENT_WORKSPACE_HOST);
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.port).toBe(String(CONTENT_WORKSPACE_PORT));
    expect(url.pathname).toBe(CONTENT_WORKSPACE_PATH);
    expect(CONTENT_WORKSPACE_ORIGIN).toBe(url.origin);
  });

  it("cannot be steered off-machine by the payload — the origin is a fixed literal", () => {
    // A run name is the only free-text field, and its grammar forbids the
    // characters an origin would need. Prove the built URL still resolves to
    // loopback for the most adversarial value the schema will accept.
    const evil = handoffOf({
      questionIds: [1],
      formats: ["mobile-social"],
      states: ["question"],
      runId: "a".repeat(64),
    });
    expect(new URL(buildContentWorkspaceUrl(evil)).hostname).toBe("127.0.0.1");
  });

  it("carries only the handoff, and it parses back to the same handoff", () => {
    const url = new URL(buildContentWorkspaceUrl(HANDOFF));
    const parsed = decodeContentHandoffParams(url.search.slice(1));
    if (isFailure(parsed)) throw new Error(parsed.errors.join("; "));
    expect(parsed.handoff).toEqual(HANDOFF);
    const lower = url.href.toLowerCase();
    for (const key of HANDOFF_FORBIDDEN_KEYS) expect(lower).not.toContain(key);
  });
});

describe("the loopback port has one owner", () => {
  it("is the same constant the render/UI dev server listens on", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../../scripts/quiz-screenshots/server.ts"),
      "utf8",
    );
    expect(src).toContain("CONTENT_WORKSPACE_PORT");
    // A second hard-coded port literal there is exactly the drift this guards.
    expect(src).not.toMatch(/RUNNER_PORT\s*=\s*\d+/);
  });
});
